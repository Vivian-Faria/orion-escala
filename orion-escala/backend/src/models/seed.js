require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const COLS = [
  {nome:'Ana Lima',apelido:'Ana',email:'ana@orion.com',cargo:'Operador',valor_hora:18,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Bruno Costa',apelido:'Bruno',email:'bruno@orion.com',cargo:'Operador',valor_hora:18,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Carla Melo',apelido:'Carla',email:'carla@orion.com',cargo:'Cozinheiro',valor_hora:22,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Diego Souza',apelido:'Diego',email:'diego@orion.com',cargo:'Auxiliar',valor_hora:16,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Eduarda Reis',apelido:'Edu',email:'edu@orion.com',cargo:'Operador',valor_hora:18,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Felipe Nunes',apelido:'Felipe',email:'felipe@orion.com',cargo:'Auxiliar',valor_hora:16,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Gabriela Rios',apelido:'Gabi',email:'gabi@orion.com',cargo:'Cozinheiro',valor_hora:22,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Henrique Luz',apelido:'Henrique',email:'henrique@orion.com',cargo:'Operador',valor_hora:18,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Isabela Faria',apelido:'Isa',email:'isa@orion.com',cargo:'Auxiliar',valor_hora:16,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Jonas Martins',apelido:'Jonas',email:'jonas@orion.com',cargo:'Entregador',valor_hora:17,role:'colaborador',status:'ativo',turno_avulso:0},
  {nome:'Rafael',apelido:'Rafael',email:'rafael@orion.com',cargo:'Operador',valor_hora:18,role:'colaborador',status:'ativo',turno_avulso:1},
  {nome:'Supervisor',apelido:'Sup',email:'supervisor@orion.com',cargo:'Supervisor',valor_hora:0,role:'supervisor',status:'ativo',turno_avulso:0},
];

const existentes = db.colaboradores.findAll();
if (existentes.length > 0) {
  console.log('Banco ja populado. Apague data/orion.json para recriar.');
  process.exit(0);
}

for (const c of COLS) {
  const senha = c.apelido.toLowerCase() + '123';
  db.colaboradores.insert({ ...c, senha_hash: bcrypt.hashSync(senha, 10) });
  console.log('OK ' + c.nome + ' | ' + c.email + ' | senha: ' + senha);
}
console.log('\nSeed concluido!');
