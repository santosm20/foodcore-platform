# FOODCORE — Plataforma comercial e distribuição do ERP

Projeto base da FOODCORE com site público, painel administrativo, API de distribuição/licenças e adaptador inicial para PagBank.

## Arquitetura

- **Frontend:** React 18 + Vite. Site público em `/`; console administrativo em `/admin`.
- **API:** Node.js + Express em `server/`.
- **Distribuição:** upload autenticado de instaladores `.exe`, histórico de versões e download por endpoint.
- **Licenciamento:** endpoints iniciais para ativação/validação, com vínculo de uma chave a um identificador de computador.
- **PagBank:** adaptador isolado em `server/src/services/pagbank.js`, checkout e recepção inicial de webhooks.
- **Produção:** use PostgreSQL e armazenamento de objetos (S3/R2) em vez do JSON/disco local do protótipo. Existe um esquema inicial em `server/schema.sql`.

## Requisitos

- Node.js 20 ou superior
- npm

## Executar localmente

### 1. Frontend

Na raiz do projeto:

```bash
npm install
npm run dev
```

Site: `http://localhost:5173`  
Painel: `http://localhost:5173/admin`

### 2. API

Em outro terminal:

```bash
cd server
npm install
cp .env.example .env
```

No Windows PowerShell, use `Copy-Item .env.example .env` no lugar de `cp`.

Edite `server/.env` e altere obrigatoriamente `JWT_SECRET`, `ADMIN_PASSWORD` e `ADMIN_EMAIL`. Depois:

```bash
npm run dev
```

API: `http://localhost:3333/api/health`

O frontend usa `http://localhost:3333/api` por padrão. Para outro endereço, crie `.env` na raiz com `VITE_API_URL=https://api.seudominio.com/api` e reinicie o Vite.

## Painel administrativo e instalador

1. Abra `http://localhost:5173/admin`.
2. Entre com `ADMIN_EMAIL` e `ADMIN_PASSWORD` definidos no servidor.
3. Informe uma versão SemVer (ex.: `1.0.0`), notas e selecione o arquivo `.exe`.
4. Clique em **Publicar versão**.

Endpoints principais:

- `POST /api/admin/login` — autenticação administrativa.
- `GET /api/admin/releases` — lista versões (JWT admin).
- `POST /api/admin/releases` — upload multipart `installer`, `version`, `notes` (JWT admin).
- `GET /api/releases/latest` — metadados da versão ativa.
- `GET /api/releases/:id/download` — download do instalador.

O limite padrão é 500 MB (`MAX_UPLOAD_MB`). Em produção, configure também o limite do proxy reverso. O servidor de desenvolvimento salva arquivos em `server/storage/releases`.

## Licenças por computador

Endpoints iniciais:

- `POST /api/licenses/admin` — cria licença (JWT admin); retorna a chave uma única vez.
- `POST /api/licenses/activate` — vincula a chave ao primeiro `machineId`.
- `POST /api/licenses/validate` — verifica chave, máquina, status e vencimento.

A chave é armazenada como hash. O primeiro computador que ativa a chave fica vinculado a ela. A API informa uma janela de tolerância offline de 72 horas, mas **a validação offline no aplicativo Windows ainda precisa ser implementada**. Para produção, o backend deve emitir uma licença/lease assinada (Ed25519 ou equivalente), que o cliente valide localmente; nunca confie apenas em data, arquivo ou resposta editável no computador do cliente. Também implemente troca/revogação de máquina no painel.

## PagBank — preparar credenciais e integração

1. Configure a conta PagBank e solicite a habilitação dos produtos de API necessários.
2. Copie `server/.env.example` para `server/.env` e configure `PAGBANK_ENV`, `PAGBANK_ACCESS_TOKEN`, `PAGBANK_API_BASE_URL`, `PAGBANK_CHECKOUT_PATH` e URL pública do webhook.
3. Nunca coloque token PagBank em variável `VITE_*`, no navegador, no repositório ou no instalador.
4. Ajuste os planos/valores de exemplo em `server/src/routes/billing.js` antes de aceitar pedidos.
5. Implemente validação criptográfica/originária do webhook, idempotência e consulta do pagamento na API PagBank antes de ativar ou renovar uma licença.

Endpoint inicial: `POST /api/billing/checkout` com `planId`, `method` (`pix` ou `card`), `recurring` e `customer` (`name`, `email`). O adaptador ainda é um ponto de integração: revise o payload e os campos de retorno com as credenciais e documentação da modalidade liberada para a sua conta antes de produção.

**Atenção às modalidades:** conforme a documentação PagBank consultada em novembro de 2026, a API de Pagamentos Recorrentes exige conta PJ aprovada no onboarding; para PF, a alternativa é Link Recorrente. O Checkout Recorrente está documentado atualmente para cartão de crédito. Pix pode ser oferecido como pagamento avulso, mas não deve ser apresentado como recorrência automática neste fluxo. Confirme elegibilidade e meios disponíveis com o PagBank.

Documentação oficial:

- https://developer.pagbank.com.br/docs/pagamentos-recorrentes
- https://developer.pagbank.com.br/docs/checkout
- https://developer.pagbank.com.br/reference/webhooks-assinaturas
- https://developer.pagbank.com.br/docs/autenticacao-pagamentos-recorrentes

## Antes de vender para clientes (produção)

Este ZIP é uma base de desenvolvimento, não uma plataforma pronta para cobrança e distribuição comercial. Antes de produção:

- Migrar JSON local para PostgreSQL e arquivos para armazenamento privado (ex.: Cloudflare R2/S3), com URLs assinadas e antivírus/validação do instalador.
- Implantar HTTPS, proxy com limite de upload, backup, logs e monitoramento.
- Implementar MFA/recuperação de senha, RBAC, trilha de auditoria e gestão de administradores.
- Completar fluxo de clientes, planos, assinaturas, cancelamentos, inadimplência e conciliação PagBank.
- Validar webhooks e consultar transações antes de alterar o estado de uma assinatura/licença.
- Implementar atualização segura do cliente Windows, assinatura Authenticode do `.exe`, hash SHA-256 e verificação da assinatura antes de instalar.
- Implementar cache local de licença assinado, janela offline de 72h e bloqueio/renovação controlados.
- Configurar termos de uso, política de privacidade, LGPD, emissão fiscal e suporte.

## WhatsApp

O site redireciona para `https://wa.me/5511976977449` (número informado para atendimento FOODCORE).
