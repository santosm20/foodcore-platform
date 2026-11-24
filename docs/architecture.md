# Arquitetura FOODCORE — visão técnica

```text
Cliente Windows
  ├─ FOODCORE ERP (executável)
  │    ├─ Banco local / fila de operações offline
  │    ├─ Cofre local para licença assinada
  │    └─ Sincronização HTTPS quando houver internet
  │
  └─ Site FOODCORE (React/Vite)
       ├─ Catálogo e planos
       ├─ Checkout PagBank
       └─ Área do cliente (a implementar)

API FOODCORE (Node/Express)
  ├─ Autenticação e painel administrativo
  ├─ Publicação de releases / downloads
  ├─ Ativação e validação de licenças por máquina
  ├─ Assinaturas / pagamentos / webhooks PagBank
  └─ PostgreSQL + armazenamento privado (produção)
```

## Regras do modelo

- Uma assinatura paga habilita uma licença de computador.
- Uma chave só pode ser ativada por um `machineId`; troca de máquina exige ação administrativa auditada.
- O ERP trabalha offline e sincroniza quando a conexão retorna. A licença offline deve ser um comprovante criptograficamente assinado pelo servidor, com prazo de tolerância limitado (proposta inicial: 72 horas).
- O servidor é a autoridade para status da assinatura, vencimento, bloqueio, versão mínima e revogação.
- Nunca gravar token PagBank no cliente Windows ou no frontend.
- Download de instalador deve ser privado/temporário em produção, com SHA-256 e assinatura Authenticode verificada pelo atualizador.

## Estado desta entrega

O site, a tela `/admin`, upload de instalador, metadados de versão, download, endpoints iniciais de licença e ponto de integração PagBank foram preparados. O ERP Windows em si não está neste repositório, e a validação offline assinada, sincronização de dados, banco PostgreSQL e confirmação real de pagamento ainda são etapas de implementação.
