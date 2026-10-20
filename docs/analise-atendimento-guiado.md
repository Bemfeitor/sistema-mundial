# Mundial · Atendimento Guiado — engenharia reversa

Data: 20/10/2026 · Fonte: https://mundial-atendimento-guiado.fabianooptometrista.chatgpt.site/teste.html (versão de teste, login `mundial_ltda@hotmail.com`, sem senha). Método: leitura do HTML/JS inline (29 KB, não minificado) + navegação.

Legenda: **[O]** observado · **[I]** inferido · **[D]** decisão proposta.

## 1. O que é

Ferramenta de **prospecção/reativação de clientes antigos por WhatsApp**, pensada para **tablet no balcão**. A vendedora importa uma planilha de clientes que não compram há X anos, revisa um por um, abre o WhatsApp com mensagem pronta, e registra manualmente o resultado (respondeu, visita combinada, comprou). Painel mostra o funil e a taxa de resposta.

Princípio central [O]: **nada é enviado automaticamente**. O sistema prepara, a pessoa confere, abre o WhatsApp, envia por conta própria e depois confirma no sistema. O sistema **não lê conversas do WhatsApp**.

## 2. Arquitetura [O]

- Login em `POST /auth/login` (form clássico com CSRF, "manter conectado 30 dias"). Versão de teste: só e-mail da loja.
- App = **um único HTML** (`teste.html`) com JS inline, sem framework. Biblioteca externa única: **SheetJS** (`xlsx.full.min.js`) para ler Excel/CSV no navegador.
- Persistência de teste: `localStorage["mundial-atendimento-teste-v1"]` = `{rows, sent}`. Aviso na tela: "Dados de teste salvos neste navegador. Não são sincronizados entre tablets."
- **Sem nenhuma chamada de API** além do login. Texto na UI anuncia a implantação futura: *"Histórico central compartilhado entre tablets estará disponível na implantação IIS + SQL Server"* e *"Na implantação, o servidor validará o histórico compartilhado das duas lojas antes de liberar cada mensagem."*
- Perfis de demonstração embutidos: `Ana Godoi · Loja 1`, `Daniela · Loja 2` (seletor no topo).

## 3. Telas [O]

| Tela | Conteúdo |
|---|---|
| **Dashboard** | KPIs: clientes na fila, mensagens confirmadas, taxa de resposta, sem resposta há 48 h. Funil "Jornada dos contatos": Importados → Enviados → Responderam → Visita combinada → Compraram. "Respostas recebidas" classificadas: Está tudo bem / Dificuldade-cansaço visual / Quer trocar os óculos / Outras. Tabela "Fila para revisar" (6 primeiros, atrasados primeiro). Período: 30 dias / mês / 90 dias. Alternância "Minha fila" × "Minha loja (gestão)". |
| **Fila de contatos** | Grupos de **10 por página** ("cada liberação é individual e revisada"). Filtro de status: Pronto para revisar, Envio confirmado, Com alerta, Corrigir dados, Retorno atrasado (48 h). Colunas: cliente/telefone, faixa de tempo, histórico da loja, status, "Revisar individualmente". |
| **Importar Excel** | Upload .xlsx/.xls/.csv (≤15 MB). Detecta a aba e a linha de cabeçalho procurando colunas `nome|cliente` + `telefone|celular|whats|fone`. Mapeamento de colunas: Nome*, WhatsApp*, Última compra/visita, Vendedor original. Prévia com contagem válidos/alertas/erros → "Criar fila com todos os clientes". Importar **não envia nada**. |
| **Relatórios** | Filtros período / loja (Loja 1, Loja 2, Consolidado) / funcionário. Indicadores: mensagens enviadas, taxa de resposta, visitas combinadas, vendas vinculadas, retornos pendentes/atrasados, alertas de contato anterior, "VIP aceitos / convidados". Tabela de atendimentos (data, cliente, faixa, resultado, status, responsável). Botão Imprimir / PDF. |
| **Novo cliente** (modal) | Nome, WhatsApp com DDD, faixa de tempo. Bloqueia telefone repetido na fila. |
| **Revisar** (modal) | Ficha editável (nome, telefone, faixa), avisos de validação, histórico, **Situação do atendimento**, próximo retorno (data), mensagem editável, checkbox "Conferi o nome, o telefone, o histórico e o texto" → habilita **Abrir WhatsApp**. Também: Copiar mensagem, Salvar correções. |
| **Atualizar resultado** (modal pós-WhatsApp) | "Sim, enviei pelo WhatsApp" / "Ainda não enviei" / abrir de novo / copiar. |

## 4. Modelo de dados [O] (objeto `row`)

```
id, name, phone, years (1|2|3|4+), original (vendedor original da planilha),
owner, store, history (texto), status: ready|alert|invalid|released|sent,
flag: 'Sem contato anterior'|'Já houve contato'|'Retorno pendente'|
      'Cliente pediu para não receber'|'Possível repetição no arquivo',
attendance (situação), nextContact (date), message, pendingKind: contact|followup,
firstContactAt, lastSentAt, followUpAt, updatedAt, sendHistory[{at, seller, store}], error
```

Faixas de tempo (`segment`): Até 1 ano · 2 anos · 3 anos · 4 anos ou mais. `parseYears` aceita número, data BR, serial do Excel.

**Situação do atendimento** (lista fechada): Não iniciado · Aguardando resposta · Cliente respondeu · Em atendimento · Vai pensar · Visita combinada · Aguardando consulta · Venda concluída · Encerrado · Encerrado sem resposta · Não quer receber mensagens.

## 5. Regras de negócio [O]

- **Validação antes de liberar**: nome obrigatório; telefone com DDD (10–11 dígitos, remove `55`); faixa de tempo selecionada; telefone único na fila. Qualquer pendência → status `invalid` ("Corrigir dados") e botão bloqueado.
- **Bloqueios de abordagem**: flag `Retorno pendente`, `Cliente pediu para não receber`, `Possível repetição no arquivo`, ou situação `Não quer receber mensagens` / `Encerrado sem resposta` → não libera.
- **Fluxo de envio**: `ready/alert` → (checkbox + botão) abre WhatsApp e vira `released` ("Aguardando confirmação") → modal → `sent` ("Envio confirmado", `attendance = Aguardando resposta`, `sendHistory` recebe {data, vendedor, loja}, contador `sent++`) ou volta para `ready`.
- **Retorno atrasado**: `attendance === 'Aguardando resposta'` e último envio ≥ **48 h** → badge vermelho, aparece no filtro "Retorno atrasado". Ação: "Preparar mensagem de retorno" (follow-up, 1 vez) e, se já houve follow-up, "Encerrar sem resposta".
- **Contato anterior**: linha com histórico de mensagem vira `alert` ("Conferir histórico") — precisa olhar antes de mandar de novo.
- **Responsável**: o vendedor do Excel fica como `original`; o atendimento atual fica com o usuário logado.
- **WhatsApp**: celular → `https://wa.me/55<fone>?text=`; desktop → `https://web.whatsapp.com/send?phone=55<fone>&text=`. Texto `encodeURIComponent` normalizado NFC. Fallback de copiar com emojis.

## 6. Mensagens padrão [O]

Primeiro contato:
> Oi, {primeiro nome}! Tudo bem? 😊
> Aqui é {vendedora}, da Ótica Mundial — {loja}. Queria saber como você está e como seus óculos estão atendendo no dia a dia.
> Está enxergando bem para leitura, celular e direção? Se tiver percebido alguma mudança ou desconforto, me conte. Estou por aqui para ajudar. 💙

Retorno (48 h):
> Oi, {primeiro nome}! Tudo bem? 😊
> Aqui é {vendedora}, da Ótica Mundial — {loja}. Passando para saber como você está e se seus óculos continuam confortáveis no dia a dia.
> Se quiser conversar ou precisar de um ajuste, estou por aqui. Conte conosco! 💙

## 7. Limitações do app atual [O/I]

- Não existe backend de dados: tudo em `localStorage`, por tablet, sem sincronização entre lojas. [O]
- "Minha loja (gestão)", filtros por loja/funcionário do relatório e a tabela de atendimentos são **estáticos** (números fixos de demonstração). [O]
- Classificação das respostas (Está tudo bem, cansaço visual, quer trocar) aparece no painel mas **não há campo para registrá-la** na ficha. [O]
- Planejado pelo autor: IIS + SQL Server para histórico central. [O]

## 8. Como entra no sistema unificado [D]

Não é um sistema novo: é um **módulo de CRM "Reativação"** dentro do que já existe em `/crm` e `/mensagens`. Mapeamento:

| Atendimento Guiado | Sistema unificado |
|---|---|
| Linha da fila | `opportunities` com `kind: "reativacao"` + campos novos: `years_since_purchase`, `original_seller`, `attendance`, `next_contact_at`, `last_sent_at`, `first_contact_at`, `follow_up_at`, `send_history[]`, `response_class` |
| Importar Excel | `/crm/reativacao/importar` — reaproveita o SheetJS no cliente; de-duplica contra `customers` por telefone (cria cliente se não existir, **sem** cashback/consentimento de marketing) |
| Abrir WhatsApp + confirmar envio | `messages` com `kind: "reativacao"` → status `aprovada` ao abrir, `enviada` ao confirmar; auditoria registra funcionário/loja/hora (o "histórico central" que faltava) |
| Retorno atrasado 48 h | Job de leitura no painel: `attendance = aguardando_resposta` e `last_sent_at` ≥ 48 h |
| Dashboard/funil | Cards em `/crm` com funil Importados → Enviados → Responderam → Visita → Venda, cruzando `opportunities.status = convertida` com `sales` |
| Histórico compartilhado entre lojas | já resolvido: Supabase, cliente único para as duas lojas |
| Bloqueio "Cliente pediu para não receber" | `customers.consent_marketing = false` bloqueia qualquer disparo |
| Lista de situações | enum `attendance` idêntico ao original, para a equipe não reaprender |
| Mensagens padrão | `src/lib/clientes/modelos.ts` ganha `reativacao_primeiro_contato` e `reativacao_retorno` com `{nome}`, `{vendedor}`, `{loja}` |

Ganhos sobre o original: fila sincronizada entre tablets e lojas, histórico real de envios, vínculo direto da reativação à venda (hoje é número fixo), campo para classificar a resposta, e o mesmo princípio "nada sai sem a pessoa confirmar".

Esforço estimado: 1 módulo (importação + fila + ficha + funil), reaproveitando `opportunities`, `messages`, `audit_log` e o portal de clientes.
