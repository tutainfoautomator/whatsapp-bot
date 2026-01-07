require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const express = require('express');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Lead = require('./models/Lead');

const app = express();
const port = process.env.PORT || 3000;

// Conectar ao MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Estado das conversas (em memória; para produção, use Redis ou DB)
const userStates = {};  // Ex: { '5511969061550': { state: 'awaiting_name', name: '...' } }

// Cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

// QR Code para login
client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Escaneie o QR code no WhatsApp Web');
});

// Quando pronto
client.on('ready', () => {
  console.log('Bot conectado!');
});

// Mensagem recebida
client.on('message', async msg => {
  const from = msg.from;  // Número do remetente
  if (!userStates[from]) userStates[from] = { state: 'initial' };

  const state = userStates[from];
  let response = '';

  // Mensagem padrão no final
  const footer = '\n\nPara atendimento de urgência favor entrar em contato via chamada de voz - Para Loja Virtual, Peças, Acessórios, Equipamentos e outros assuntos confira nosso site em: http://www.tutainfo.com.br e nosso instagram @tuta.info';

  if (state.state === 'initial') {
    response = 'Olá tudo bem? Eu sou a Mia, assistente virtual da Tutá Info, feita pelo time de Dev’s aqui da Tutá Info, estou aqui para agilizar seu atendimento! Para começar me informe seu nome ou o nome da sua empresa...' + footer;
    state.state = 'awaiting_name';
  } else if (state.state === 'awaiting_name') {
    state.name = msg.body.trim();
    response = `Seja muito bem vindo(a) a Tutá Info ${state.name} agora me fala sobre qual assunto você deseja tratar conosco (escolha uma das opções)\n\n1 – Montagem / Configuração de um Novo Computador\n2 – Manutenção Consertos e Reparos de Computador / Notebook / Tablet\n3 – Câmeras de segurança (CFTV)\n4 – Desenvolvimento de Softwares e Aplicações` + footer;
    state.state = 'awaiting_subject';
  } else if (state.state === 'awaiting_subject') {
    const choice = msg.body.trim();
    if (!['1', '2', '3', '4'].includes(choice)) {
      response = 'Opção invalida escolha novamente a opção desejada....' + footer;
    } else {
      state.subjectChoice = choice;
      if (choice === '1') {
        response = 'Beleza! Me fala agora qual será a principal utilização da sua nova máquina – escolha uma das opções:\n\n1 – Dia a dia – aplicações de escritório e navegação na internet, trabalho, estudo\n2 – Games e Jogos\n3 – Desenvolvimento de softwares\n4 – Servidor de Rede\n5 – Edição de Video / Edição de Musica / Edição de Fotos / Mixagem / Masterização / Renderização' + footer;
        state.state = 'awaiting_usage';
      } else if (choice === '2') {
        response = 'Você precisa deste serviço para:\n1 – Computador Desktop\n2 – Computador ALL-IN-ONE\n3 – Notebook\n4 – Tablet' + footer;
        state.state = 'awaiting_device';
      } else if (choice === '3') {
        response = 'Você precisa de:\n1 – Manutenção de um sistema de câmeras já existente\n2 – Instalação de um sistema de câmeras novo\n3 – Outros assuntos' + footer;
        state.state = 'awaiting_camera';
      } else if (choice === '4') {
        response = 'Voce precisa desenvolver um programa software ou aplicação para uso pessoal ou profissional? Digite abaixo a sua necessidade em detalhes para que possamos melhor atende-lo:' + footer;
        state.state = 'awaiting_software_details';
      }
    }
  } else if (state.state === 'awaiting_usage') {
    const choice = msg.body.trim();
    if (!['1', '2', '3', '4', '5'].includes(choice)) {
      response = 'Opção invalida escolha novamente a opção desejada....' + footer;
    } else {
      state.details = msg.body;  // Armazenar uso
      response = 'Entendido, estou passando seu atendimento para nossa equipe de especialistas para dar continuidade em sua demanda, nossos especialistas irão responder o mais breve possível!' + footer;
      await saveLead(from, state.name, 'Montagem / Configuração de um Novo Computador', state.details);
      delete userStates[from];  // Reset conversa
    }
  } else if (state.state === 'awaiting_device') {
    const choice = msg.body.trim();
    if (!['1', '2', '3', '4'].includes(choice)) {
      response = 'Opção invalida escolha novamente a opção desejada....' + footer;
    } else {
      response = 'Maravilha – digite então a marca e o modelo do seu equipamento:' + footer;
      state.state = 'awaiting_brand_model';
    }
  } else if (state.state === 'awaiting_brand_model') {
    state.details = msg.body;
    response = 'Entendido, estou passando seu atendimento para nossa equipe de especialistas para dar continuidade em sua demanda, nossos especialistas irão responder o mais breve possível!' + footer;
    await saveLead(from, state.name, 'Manutenção Consertos e Reparos de Computador / Notebook / Tablet', state.details);
    delete userStates[from];
  } else if (state.state === 'awaiting_camera') {
    const choice = msg.body.trim();
    if (!['1', '2', '3'].includes(choice)) {
      response = 'Opção invalida escolha novamente a opção desejada....' + footer;
    } else {
      response = 'Entendido, estou passando seu atendimento para nossa equipe de especialistas para dar continuidade em sua demanda, nossos especialistas irão responder o mais breve possível!' + footer;
      await saveLead(from, state.name, 'Câmeras de segurança (CFTV)', msg.body);
      delete userStates[from];
    }
  } else if (state.state === 'awaiting_software_details') {
    state.details = msg.body;
    response = 'Entendido, estou passando seu atendimento para nossa equipe de especialistas para dar continuidade em sua demanda, nossos especialistas irão responder o mais breve possível!' + footer;
    await saveLead(from, state.name, 'Desenvolvimento de Softwares e Aplicações', state.details);
    delete userStates[from];
  }

  if (response) {
    msg.reply(response);
  }
});

// Função para salvar lead
async function saveLead(phone, name, subject, details) {
  const lead = new Lead({ phone, name, subject, details });
  await lead.save();
}

// Endpoint para relatório mensal (acesse via navegador: https://seu-app.render.com/report)
app.get('/report', async (req, res) => {
  const leads = await Lead.find({ timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });  // Últimos 30 dias
  res.json(leads);
});

// Cron para enviar relatório mensal por email (todo dia 1 às 9h)
cron.schedule('0 9 1 * *', async () => {
  const leads = await Lead.find({ timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });
  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.REPORT_EMAIL,
    subject: 'Relatório Mensal de Leads - Tutá Info',
    text: JSON.stringify(leads, null, 2)
  };
  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.log(err);
    else console.log('Relatório enviado!');
  });
});

client.initialize();
app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));