# Órion Escala — Guia de instalação local

## Pré-requisitos
- Node.js 18+ → https://nodejs.org (baixe a versão LTS)
- Um terminal (PowerShell no Windows ou Terminal no Mac)

---

## Passo 1 — Instalar dependências

```bash
cd backend
npm install
```

---

## Passo 2 — Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Abra o arquivo `.env` e ajuste:
- `JWT_SECRET` → troque por qualquer texto longo e aleatório
- `ESTAB_LAT` e `ESTAB_LNG` → coordenadas do DK Sion (pegue no Google Maps)
- `ESTAB_RAIO_M` → raio em metros para o check-in GPS (padrão: 100)

---

## Passo 3 — Criar o banco de dados

```bash
node src/models/migrate.js
```

Você verá: ✅ Banco de dados criado com sucesso

---

## Passo 4 — Popular com dados iniciais

```bash
node src/models/seed.js
```

Vai criar todos os colaboradores. Cada um terá:
- Login: email (ex: ana@orion.com)
- Senha inicial: apelido + 123 (ex: ana123)
- O supervisor acessa com: supervisor@orion.com / senha: sup123

---

## Passo 5 — Iniciar o servidor

```bash
npm run dev    # com auto-reload (recomendado para desenvolvimento)
# ou
npm start      # produção
```

Servidor rodando em: http://localhost:3001
Health check: http://localhost:3001/api/health

---

## Estrutura do projeto

```
backend/
├── .env                    ← suas variáveis (não sobe para o git)
├── .env.example            ← modelo das variáveis
├── package.json
├── data/
│   └── orion.db            ← banco SQLite (criado automaticamente)
└── src/
    ├── server.js           ← ponto de entrada
    ├── middleware/
    │   └── auth.js         ← validação JWT
    ├── models/
    │   ├── db.js           ← conexão com banco
    │   ├── migrate.js      ← cria as tabelas
    │   └── seed.js         ← dados iniciais
    ├── routes/
    │   ├── auth.js         ← login, trocar senha
    │   ├── colaboradores.js← CRUD colaboradores
    │   └── escalas.js      ← escalas, confirmações, check-in
    └── services/
        └── agendador.js    ← notificações automáticas (cron)
```

---

## Endpoints principais

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/auth/login | Login (retorna JWT) |
| GET | /api/auth/me | Dados do usuário logado |
| POST | /api/auth/trocar-senha | Troca a senha |

### Escalas (colaborador)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/escalas/meu-turno | Turnos do colaborador logado |
| POST | /api/escalas/:id/confirmar | Confirma escala (notif1) |
| POST | /api/escalas/:id/recusar | Recusa escala |
| POST | /api/escalas/:id/confirmar-presenca | Confirma presença 2h antes |
| POST | /api/escalas/:id/checkin | Check-in GPS |

### Escalas (supervisor)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/escalas/semana-atual | Semana com todas as vagas |
| POST | /api/escalas/semana | Cria nova semana com DPH |
| POST | /api/escalas/publicar/:id | Publica a escala |
| PUT | /api/escalas/designar | Designa colaborador nas vagas |
| GET | /api/escalas/alertas | Turnos urgentes/vagos |

### Colaboradores (supervisor)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/colaboradores | Lista todos |
| POST | /api/colaboradores | Cadastra novo |
| PUT | /api/colaboradores/:id | Atualiza |
| POST | /api/colaboradores/:id/resetar-senha | Reseta senha |

---

## Próximo passo — Frontend conectado

Após o servidor rodar, o próximo passo é conectar os arquivos HTML
ao backend via fetch(). Cada botão do protótipo passará a chamar
uma rota real em vez de modificar variáveis JS locais.

## Hospedar em produção (Railway)

1. Crie conta em railway.app
2. "New Project" → "Deploy from GitHub"
3. Suba o código no GitHub e conecte
4. Adicione as variáveis do .env no painel do Railway
5. O Railway detecta Node.js automaticamente e sobe o servidor

Custo: ~$5/mês no plano Hobby (suficiente para esta operação)
