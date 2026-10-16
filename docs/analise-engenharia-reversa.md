# Ótica Mundial — Engenharia reversa e plano do sistema unificado

Data: 16/10/2026 · Método: REA 6.5.0 (`analyze-javascript-application` sobre bundles públicos baixados) + leitura estática dos bundles + navegação passiva nas versões de teste (nenhum dado gravado).

Legenda: **[O]** observado no código/tela · **[I]** inferido · **[D]** decisão de design proposta.

---

## 1. Visão geral dos 4 sistemas

| Sistema | O que é | Backend | Stack |
|---|---|---|---|
| **Mundial Retail** | ERP/PDV de ótica + joalheria/relojoaria (gestão, vendas, OS, financeiro) | **Sim** — `GET/POST /api/retail` (ações), `/api/photos` [O] | vinext (Next sobre Vite RSC), React 19, shadcn/Base UI, lucide, SheetJS, jsPDF, qrcode |
| **Mundial Fidelidade** | Cashback/benefícios + cartão digital do cliente (QR) | **Sim** — `/api/mundial` (rota única com `op`), `/api/auth/*`, sessão por cookie [O] | vinext, React 19, shadcn, qrcode, jsQR, PWA |
| **Experiência Multifocal** | Simulador didático (multifocal, espessura, fotossensível) | **Não** — 100% cliente, sem persistência [O] | JS puro, WebGL 1, Canvas 2D, SVG |
| **Oferecer — Balcão 2** | Assistente de balcão de **loja de tintas**: busca → produto + complementares + guia impresso | Quase não — 1 `fetch('api/fichas-tecnicas')` opcional; "enviar ao caixa" é stub (`console.log`) [O] | JS puro inline, sem framework |

Os dois primeiros têm o mesmo stack e padrões (centavos, auditoria antes/depois, RBAC, idempotência) — **foram feitos pelo mesmo autor/gerador e já estão prontos para fusão** [I].

> Limitação REA: o grafo semântico do REA não detectou os `fetch` do Retail (o bundle de 1,27 MB); a leitura direta do bundle confirmou `/api/retail` e `/api/photos`. As regras de negócio (cálculo de comissão, cashback, estoque) ficam **no servidor** e não estão nos bundles — o que se sabe delas vem dos formulários e textos da UI.

---

## 2. Mundial Retail (gestão + vendas)

**Telas [O]:** Início · Nova venda · Clientes · Óculos · Serviços · CRM · Mensagens · Financeiro · Relatórios · Administração. Rota por hash (`#Início`). Seletor de loja (Consolidado / Loja 1 / Loja 2) e "Simular funcionário".

- **Início:** KPIs (faturamento, ticket médio, clientes atendidos, pedidos em andamento), gráfico por loja, "Precisa de atenção" (pedidos atrasados, mensagens a validar, duplicatas vencidas, serviços), vendas recentes.
- **Nova venda (wizard):** Cliente → Produtos → Configuração → Revisão → Pagamento → Conclusão.
  - Filtros: categoria (Lentes, Armações, Joias, Relógios, Acessórios, Serviços), tipo de lente (Visão simples, Multifocal, Bifocal, Ocupacional, Solar), fabricante, família; tag Principal/Adicional/Segundo par/Upgrade; "um par de lentes por pedido".
  - Receita OD/OE: esférico, cilíndrico, eixo, adição, DNP, altura, distância vértice, pantoscópico, curvatura, prisma; "armação própria".
  - Desconto R$/% limitado por `discountLimit` do funcionário.
  - Pagamento múltiplo: Dinheiro, Pix, Débito, Crédito à vista/parcelado (adquirente Stone, bandeira, NSU, autorização → taxa e líquido previstos), Duplicata, Gift Card, Cashback, Crédito do cliente, Saldo na retirada.
- **Óculos (OS de laboratório):** etapas Venda concluída → Aguardando pedido → Pedido enviado → Em produção → Recebido → Em montagem → Conferência → Pronto → Cliente avisado → Retirado; exceções (Pendência técnica, Retrabalho, Devolvido ao laboratório, Cancelado…). "Pronto" exige checklist (DNP/altura conferidas, armação, limpeza).
- **Serviços:** OS de joalheria/relojoaria/ótica, troca de pilha rápida, fotos da peça (≤5 MB).
- **CRM:** oportunidades (Pós-venda, Orçamento, Serviço, Aniversário, Campanha, Indicação, Reativação/Cashback) em kanban; "Iniciar venda" a partir da oportunidade.
- **Mensagens:** fila "o sistema prepara, você confere e aprova" (cashback liberado, óculos pronto). **WhatsApp simulado** — aprovar não envia.
- **Financeiro:** duplicatas, conciliação de cartões (import CSV/XLSX da Stone, esperado × líquido), Gift Cards (QR), Cashback.
- **Relatórios:** construtor (campos, agrupamento 2 níveis, CSV/XLSX/PDF), Raio-X do vendedor, comissões, formas de pagamento.
- **Administração:** funcionários (perfis Administrador, Gerente, Vendedor, Caixa, Técnico Óptico, Ourives, Relojoeiro, CRM; 11 permissões; até 5 regras de comissão), catálogo, taxas de cartão, campanhas de cashback, modelos de mensagem, checklists, auditoria, integrações (Five/Dribion ERP, WhatsApp, Stone, laboratórios — **todas simuladas/desconectadas**).

**Modelo [O]:** `employees, customers, products, sales, orders, services, opportunities, messages, receivables, giftcards, cashback, campaigns, rates, reconciliations, checklists, templates, audit, reports`. Valores em centavos; controle otimista por `revision` (409 → recarrega). Ações: `sale.create, customer.create, order.update, service.*, crm.*, message.*, receivable.pay/remind, gift.create, stone.import, report.save, admin.save`.

---

## 3. Mundial Fidelidade (clientes)

**Telas [O]:** console (Início, Clientes, Importar XML, Benefícios, Campanhas, Auditoria, Equipe e lojas) + **cadastro público** ("Seu cartão. Seus benefícios.") + **área do cliente `/cartao#token`** (Início, Benefícios, QR Code, Histórico).

- Cliente não faz login: acessa por **token opaco revogável** no link/QR (sem CPF/telefone no QR). Vendedor lê o QR com a câmera (jsQR).
- **Benefícios = livro-razão em R$ (centavos)**, não pontos: `cashback | credit` (uso parcial) e `gift | coupon` (uso único), com `available_at` (carência) e `expires`.
- **Compra com preview:** `preview` calcula o cashback → vendedor confere → `purchase` com `key` idempotente + `expectedReward`/`expectedCampaignId` (servidor detecta mudança de regra).
- **Campanha:** `percent`, mínimo, teto, validade (60 d), carência, limite por cliente, categoria, loja, nível, vigência. Várias elegíveis → **vale a maior**. Campanha ativa observada: "Mundial vale Mais!!!" 3%, mínimo R$ 299, 60 dias.
- Níveis manuais: Novo, Silver, Gold, Black, VIP. Categorias: Ótica, Solar, Joias, Relógios, Serviços.
- LGPD: consentimentos versionados (participação obrigatório, marketing opcional); CPF mascarado; auditoria antes/depois.
- Importação XML (≤1.000 clientes, bloqueia DOCTYPE/ENTITY, valida CPF).
- Papéis: admin, gerente, vendedor.
- **Não existe:** pontos, catálogo de recompensas, indicação.

---

## 4. Experiência Multifocal (apoio à venda)

Tela única, 2 abas [O]:

- **Multifocais:** 4 desenhos (Tradicional, Digital, Personalizada, Ocupacional) com perfis qualitativos (`far, corridor, near, edge, warp`); distância (Longe/Intermediário/Perto), corredor curto/padrão/longo, adição 0,75–3,50; comparar 2 ou 4 lado a lado; câmera ao vivo ou cena gerada. Shader WebGL com desfoque em 3 níveis e distorção lateral.
- **Espessura:** modelo óptico real (`thickness-model.js`): índices 1.50–1.74, esf −12…+8, cil, eixo, A/B/ponte/DNP/altura, formato (oval/redondo/retangular), tipo de armação (metal/três peças/acetato → espessura mínima), sagita bicônica, bisseção para espessura central. Saídas: centro, borda nasal/temporal, mapa de calor, perfil.
- **Fotossensível:** paletas ilustrativas Transitions GEN S / XTRActive / Color Touch, ZEISS PhotoFusion X, HOYA Sensity 3; escurecimento manual.
- **Não tem:** preço, catálogo, tratamentos (AR, filtro azul), orçamento, persistência, WhatsApp/PDF. Os perfis não representam produtos reais (o próprio código avisa).

**Reaproveitável diretamente:** `thickness-model.js` (standalone), shader multifocal, paleta fotossensível.

---

## 5. Oferecer (referência a adaptar)

Assistente de balcão para **tintas** [O]. Dois modos:
1. **Venda Complementar:** vendedor digita a situação ("vou pintar o quarto do meu filho") → "A IA entendeu" (ambiente, prioridade, cuidado) → produto principal (Recomendada/Econômica) → **"Complementares obrigatórios — não deixe o cliente sair sem"** (Preparação, Aplicação, Itens que encantam) → perguntas ao cliente → pedido com "+R$ em complementos (+X% no ticket)" → enviar ao caixa / imprimir guia do cliente.
2. **Fichas técnicas:** catálogo filtrável (marca, superfície, característica) com preços à vista/a prazo/oferta e "dica do vendedor".

Achados críticos [O]: a "IA" é **casamento de palavras-chave local** (sem LLM); a "afinidade %" é **pseudoaleatória** (hash do id); preços são fixos no código; "enviar ao caixa" só faz `console.log`; sem persistência.

O valor está no **conceito de UX** (situação → pacote → complementos → ticket), não no código.

---

## 6. Sistema unificado proposto [D]

### 6.1 Módulos

```
┌──────────────── Ótica Mundial (app único, multi-loja, RBAC) ─────────────────┐
│ GESTÃO            │ VENDAS (Balcão)                │ CLIENTES                  │
│ Painel/KPIs       │ Assistente de balcão (Oferecer)│ Cadastro 360° + LGPD      │
│ OS de óculos      │ Nova venda / Orçamento         │ Cartão digital (QR/token) │
│ OS joias/relógios │ Simulador (multifocal/espess.) │ Cashback/benefícios       │
│ Financeiro/Stone  │ Pagamentos/Gift/Cashback       │ CRM + Mensagens WhatsApp  │
│ Relatórios        │ Comprovante / guia do cliente  │ Portal do cliente         │
│ Administração     │                                │                           │
└────────────────── Auditoria · Catálogo · Funcionários · Lojas ─────────────────┘
```

### 6.2 Assistente de balcão para ótica (adaptação do Oferecer)

Fluxo: **Receita + situação → pacote recomendado → complementos → simulação → orçamento → venda**.

| Oferecer (tintas) | Ótica |
|---|---|
| Situação ("quarto infantil") | Perfil de uso: "8h no computador", "dirige à noite", "1º multifocal", "criança míope", "praia/esporte", "leitura" |
| Produto principal Recomendada/Econômica | Pacote **Essencial / Conforto / Premium** (armação + lente + tratamento) |
| Tamanho p/m/g | Faixa de grau → **índice recomendado** (regra: |esf| alto → 1.67/1.74), calculado pela receita |
| Complementares: Preparação/Aplicação/Encantam | **Lente/tratamentos** (AR, filtro azul, fotossensível, alto índice) · **Proteção/ajuste** (garantia estendida, estojo rígido) · **Encantam** (2º par solar, clip-on, spray, cordão, lente de contato) |
| Ficha técnica + dica do vendedor | Ficha de lente (índice, desenho, corredor, prazo do laboratório, garantia) + argumento de venda ("progressivo sem AR cansa à noite") |
| Psicologia das cores | Consultoria de estilo: formato de rosto × armação |
| Guia impresso | Orçamento/guia do cliente por **PDF e WhatsApp** |

Correções obrigatórias em relação ao Oferecer: afinidade por **regra real** (compatibilidade com receita, margem, estoque, histórico); preços do catálogo; persistir o atendimento como **orçamento** (vira oportunidade no CRM se não fechar); "enviar ao caixa" = criar a venda de verdade.

Integração com o simulador: botões "Mostrar ao cliente" no pacote abrem a simulação multifocal/espessura **já com a receita e o índice do pacote** — o simulador hoje é isolado; esse é o ganho de uni-lo.

### 6.3 Fusão Retail × Fidelidade (sobreposições)

| Conceito | Retail | Fidelidade | Unificado |
|---|---|---|---|
| Cliente | `customers` | `customers` + nível + consentimentos + token | **Uma entidade** com tudo |
| Cashback | `cashback` + `campaigns` (campos iguais) | `benefits` livro-razão + `campaigns` | Livro-razão do Fidelidade (mais completo); venda do Retail gera o benefício automaticamente |
| Gift Card | `giftcards` | `gift` (presente) | Mantém ambos, mesmo livro-razão |
| Auditoria | antes/depois | antes/depois | Uma tabela `audit_log` |
| Papéis | 8 perfis + 11 permissões | admin/gerente/vendedor | RBAC do Retail |
| Lojas | Loja 1/2 | Loja 1/2 | `stores` |

### 6.4 Modelo de dados núcleo

`stores, employees(role, permissions[], discount_limit, commission_rules[]), customers(cpf, phone, birth, level, card_token, consents[]), prescriptions(od/oe…, exam_date, optometrist), products(category, brand, family, lens{type,indices,treatments,required_fields,sph_range,lab,days}, frame{model,color,size}, price_cents, cost_cents, stock), quotes(atendimento do balcão), sales(items, rx, lens, payments[], discount, commission, margin), lab_orders(status, history, checklist), service_orders, opportunities, messages, receivables, benefits(ledger), benefit_movements, campaigns, card_rates, reconciliations, templates, checklists, audit_log`. Dinheiro sempre em **centavos inteiros**; ações idempotentes com chave.

### 6.5 Stack sugerida

Como os dois sistemas já são **vinext/React 19 + shadcn**, manter: Next.js (App Router) + React + shadcn/ui + Postgres (ex.: Supabase) com RLS por loja/perfil. Simulador entra como componente cliente (WebGL). WhatsApp: começar com fila de aprovação (como hoje) e depois API oficial (BSP).

### 6.6 Fases

1. **Núcleo**: lojas, funcionários/RBAC, clientes + receitas, catálogo, auditoria.
2. **Venda + OS de óculos** (Retail).
3. **Fidelidade**: livro-razão, campanhas, cartão digital, portal do cliente.
4. **Assistente de balcão** + simulador integrado + orçamento PDF/WhatsApp.
5. Financeiro/conciliação Stone, relatórios, CRM/mensagens, integrações (ERP Five, laboratórios).

---

## 6.7 Decisões do cliente (16/10/2026) — prevalecem sobre o plano acima

- **Banco:** Supabase (Postgres + Auth + RLS). Credenciais entregues depois → app roda em **modo demonstração** (dados em memória) até `NEXT_PUBLIC_SUPABASE_URL` existir.
- **Duas lojas**, cadastro de **usuários/vendedores** e **departamentos**.
- **Assistente de balcão:** regras fixas **e** LLM (as duas). Sem chave de IA → só regras.
- **Campos rápidos do atendimento:** idade, cliente/não cliente, primeiro óculos, homem/mulher, tipo de óculos (perto, longe, multifocal), criança — e mais os que facilitam (ver `src/lib/balcao`).
- **Simulador:** botão na tela de início do atendimento.
- **Catálogo/pacotes:** a ótica já tem; preenchimento posterior (seed de exemplo).
- **Agente de IA do gestor** (Claude, Hermes, Codex…): servidor **MCP** com acesso total (leitura e escrita auditada) via token.
- **Gestão:** acrescentar recursos típicos de ERP de ótica: estoque com grade e por loja, transferência entre lojas, fornecedores/laboratórios, pedidos de compra, contas a pagar/receber, caixa (abertura/fechamento), DRE simplificada, metas e comissões, curva ABC, receitas vencendo (reexame), aniversariantes, convênios, garantia, agenda de exames.
- **Modo de trabalho:** autônomo (YOLO).

## 7. Pontos de atenção

- **Segurança:** as versões de teste do Retail e do Fidelidade abrem **sem login** e com perfil de administrador ("Simular funcionário", "Acesso direto, sem usuário ou senha"). O Fidelidade guarda dados **no servidor, compartilhados entre visitantes**. Confirme que não há dados reais de clientes nesses ambientes.
- **Nomes de fabricantes** (Transitions, ZEISS, HOYA) no simulador são só paleta ilustrativa; não apresentar como simulação oficial do produto.
- **Oferecer** é de terceiro (allanturing.com): usar como **referência de conceito**, não copiar código/dados.
- Regras de comissão, estoque e cálculo exato de cashback ficam nos servidores originais — **não recuperáveis** pelos bundles; precisam ser especificadas por vocês.
