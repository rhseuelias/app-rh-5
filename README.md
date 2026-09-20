# AppliQ RH

**Gestão de pessoas que gera resultados**

App interno de gestão de RH (CLT/PJ) — Dashboard, Colaboradores, Férias,
Situação Aquisitiva, Onboarding, Calendário Geral, Aniversários e Projeção
de Custo.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase (Postgres + Autenticação) — banco com backup diário automático

## 1. Rodar localmente

```bash
npm install
cp .env.example .env.local
# preencha .env.local com os dados do seu projeto Supabase (passo 2)
npm run dev
```

Abra http://localhost:3000

## 2. Criar o banco de dados (Supabase)

1. Crie uma conta em https://supabase.com (dá pra logar com Google ou GitHub).
2. Clique em **New project**. Escolha um nome, uma senha forte para o banco
   (guarde essa senha) e a região mais próxima (ex.: São Paulo/`sa-east-1`).
3. Espere o projeto ser criado (~2 minutos).
4. Vá em **SQL Editor** (menu lateral) → **New query**.
5. Copie todo o conteúdo do arquivo `supabase/schema.sql` deste projeto,
   cole ali e clique em **Run**. Isso cria todas as tabelas, as regras de
   segurança e já carrega os feriados nacionais de 2026.
6. Faça o mesmo com o arquivo `supabase/migration_002_pre_cadastro.sql`
   (cole em uma **New query** e clique em **Run**). Isso cria as tabelas do
   pré-cadastro de candidato e o bucket de armazenamento dos documentos.
7. Faça o mesmo com o arquivo `supabase/migration_003_processo_integracao.sql`
   (cole em uma **New query** e clique em **Run**). Isso cria as tabelas do
   novo Processo de Integração (etapas, cronômetro, histórico e avaliação
   dos 90 dias).
8. Faça o mesmo com o arquivo `supabase/migration_004_ficha_admissao.sql`
   (cole em uma **New query** e clique em **Run**). Isso cria as tabelas de
   **Unidades/Filiais** e **Dependentes**, e adiciona os campos novos da
   Ficha de Admissão em Colaboradores (estado civil, grau de instrução,
   dados bancários, horário de trabalho, vale transporte/alimentação,
   detalhes de desligamento etc.).
9. Faça o mesmo com o arquivo `supabase/migration_005_arquivar_painel.sql`
   (cole em uma **New query** e clique em **Run**). Isso faz o Painel de
   Integração "arrumar a casa sozinho": quem já foi Efetivado(a) ou Não
   efetivado(a) some do painel automaticamente depois de alguns dias (7 por
   padrão, configurável), e também cria a opção de retirar manualmente pelo
   botão 🗑️ no cartão — sem apagar nenhum registro nos dois casos.
10. Faça o mesmo com o arquivo `supabase/migration_006_calendario_avancado.sql`
    (cole em uma **New query** e clique em **Run**). Isso deixa o Calendário
    Geral completo: cor por evento, data final, repetição, alerta por
    e-mail e a configuração dos números de WhatsApp.
11. Faça o mesmo com o arquivo `supabase/migration_007_ferias_avancado.sql`
    (cole em uma **New query** e clique em **Run**). Isso deixa o módulo de
    **Férias** completo: cenários de simulação, status "planejada", valor
    estimado guardado em cada período, e a base de feriados nacionais de
    2026 a 2028 (usada pelo planejamento automático pra não cair em cima de
    feriado).
12. Faça o mesmo com o arquivo `supabase/migration_008_simulacao_avancada.sql`
    (cole em uma **New query** e clique em **Run**). Isso deixa o
    **Simulador de férias** completo: cenários com empresa/unidade/ano,
    configuração salva (modelo de fracionamento, regras de data, capacidade
    da equipe, estratégia de priorização) e a marcação de quem definiu cada
    período (RH manualmente ou o algoritmo automático).
13. Vá em **Project Settings → API**. Copie:
   - **Project URL** → cole em `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → cole em `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** (em "Project API keys", não a "anon") → cole em
     `SUPABASE_SERVICE_ROLE_KEY`. Essa chave é secreta — nunca a exponha no
     navegador nem a prefixe com `NEXT_PUBLIC_`. Ela é usada só no servidor
     para o formulário público de pré-cadastro (o candidato não tem login).

## 3. Criar as 3 contas de acesso do RH

O app não tem tela de "criar conta" pública (de propósito — só o RH deve
entrar). Para criar os acessos das 3 pessoas:

1. No Supabase, vá em **Authentication → Users → Add user**.
2. Crie um usuário para cada pessoa (e-mail + senha). Marque
   **Auto Confirm User** para não precisar de e-mail de confirmação.
3. Cada pessoa faz login em `/login` com o e-mail e senha que você definiu.
   (Depois cada uma pode trocar a própria senha em
   **Authentication → Users → ... → Reset password**, ou você implementa
   uma tela de "esqueci minha senha" mais adiante.)

## 4. Pré-cadastro de candidato

- Na tela **Pré-cadastro**, clique em **Gerar link de pré-cadastro**
  (opcionalmente já preenchendo nome, cargo e empresa). O link gerado pode
  ser copiado com o botão **🔗 Copiar link** e enviado por WhatsApp/e-mail
  para o candidato aprovado na entrevista.
- O candidato abre o link (sem precisar de login), preenche os dados
  pessoais, bancários e anexa os documentos (RG, CTPS, comprovante de
  residência etc.). Tudo fica salvo no app.
- Você revisa os dados enviados na página de detalhe do candidato e clica em
  **Converter em colaborador** — isso cria a ficha em Colaboradores já com
  os dados e documentos, para você completar cargo definitivo, salário e
  data de admissão.
- **Importação via Google Forms:** se preferir mandar um formulário do
  Google Forms em vez do link do app, exporte as respostas em
  **Respostas → ⋮ → Fazer download (.csv)** e importe esse arquivo na
  tela de Pré-cadastro. Colunas como nome, e-mail, telefone, cargo e CPF
  são reconhecidas automaticamente; o resto vira observação, pra não
  perder nenhuma informação.

## 5. Processo de Integração (Painel de Integração)

Quando você clica em **Converter em colaborador** na tela de Pré-cadastro, o
app cria automaticamente o processo de integração da pessoa, com todas as
etapas configuradas (Pré-cadastro, Exame admissional, Exame psicológico,
Vale-transporte, Inclusão de benefícios, Contrato, Admissão, Onboarding,
Pesquisa onboarding, Experiência e Avaliação dos 90 dias) — não precisa criar
nada manualmente.

- **Painel de Integração** (menu lateral): visão geral com indicadores
  (quantos estão em andamento, atrasados, em experiência, efetivados etc.) e
  filtros por empresa, líder e status. Clicar num colaborador abre a ficha
  dele com a linha do tempo completa.
- **Ficha do colaborador**: cada etapa é clicável — ao clicar, abre um painel
  com responsável, prazo, campo de observações, anexo de documento e o
  histórico de alterações. O responsável só consegue avançar pra próxima
  etapa depois de concluir a anterior (bloqueio em sequência).
- **Cronômetro**: começa automaticamente quando a etapa **Exame admissional**
  é marcada como Realizada, e calcula o prazo da etapa **Onboarding** (5 dias
  por padrão, configurável).
- **Experiência de 90 dias**: assim que a **Pesquisa onboarding** é concluída,
  o app calcula automaticamente a data final da experiência (a partir da data
  de admissão) e já cria um evento no **Calendário Geral** avisando a
  aproximação da Avaliação dos 90 dias (15 dias de antecedência, configurável).
- **Avaliação dos 90 dias**: registra as notas, observações e a decisão final
  — **Efetivado(a)** ou **Não efetivado(a)** — encerrando o processo.
- **Configurações → Processo de Integração** (link no topo do Painel):
  permite editar nome, responsável, ordem, prazo e ativar/desativar cada
  etapa, além dos prazos gerais (integração, experiência, antecedência do
  alerta e o prazo de saída do painel). Mudanças valem só para processos
  criados dali pra frente.
- **Painel não acumula Efetivado(a)/Não efetivado(a)**: depois de 7 dias
  (configurável em Configurações), o cartão sai sozinho do Painel — e dá
  pra tirar na hora clicando no 🗑️ do próprio cartão. Em nenhum dos dois
  casos o registro é apagado: o histórico completo continua salvo e
  acessível pela ficha do colaborador, só não aparece mais no quadro do
  Painel — e o total de Efetivados/Não Efetivados continua contando
  normalmente no painel lateral **Histórico**, mesmo depois do cartão sair.
- **Painel lateral Histórico / Legenda** (ao lado do quadro): a aba
  **Histórico** mostra os totais (Novos colaboradores, Em andamento, Dentro
  do prazo, Atrasadas, Efetivados, Não Efetivados); a aba **Legenda** mostra
  o que cada cor/selo dos cartões significa.

**O que ficou simplificado nesta primeira versão** (dá pra evoluir depois):
notificação de verdade por e-mail/WhatsApp (por enquanto os alertas aparecem
só dentro do próprio Painel); login e permissão separados para Líder e
Funcionário (hoje só o RH tem conta — os campos "responsável" de cada etapa
são só informativos); reordenar etapas arrastando (por enquanto é um campo de
número) e cores personalizadas por etapa; dependências mais complexas entre
etapas (por enquanto a sequência é sempre linear, na ordem configurada).

### Calendário Geral — agendamento completo

Clicar em qualquer dia do calendário abre a tela de novo evento, já com
aquele dia preenchido. O agendamento tem:

- **Título, categoria e cor**: escolha a categoria (Admissão, Férias,
  Reunião, Ação de RH, Aniversário, Prazo de DP) e, se quiser, uma cor
  própria numa paleta de 12 cores — se não escolher nenhuma, usa a cor
  padrão da categoria.
- **De / Até**: eventos de mais de um dia (uma viagem, um treinamento, um
  período de férias) pintam a faixa da cor em todos os dias do intervalo no
  calendário, não só no primeiro dia.
- **Repete**: Não repete / Todos os dias / Todas as semanas / Todos os
  meses / Todos os anos — com um campo opcional "Repetir até" (se deixar em
  branco, repete por 1 ano a partir do início).
- **Alerta**: até 2 e-mails de aviso por evento.
- **Excluir**: clicando no dia, dá pra apagar qualquer evento daquele dia
  direto na mesma tela (⚙️ **Configurações do calendário**, no topo da
  página, guarda até 2 números de WhatsApp para o relatório diário das
  obrigações).

**Importante sobre o envio de verdade**: os e-mails de alerta e os números
de WhatsApp ficam salvos no banco, mas o app ainda não está conectado a
nenhum serviço que realmente dispara e-mail ou mensagem de WhatsApp — isso
exige uma conta em um provedor (ex.: Resend/SendGrid para e-mail, WhatsApp
Business API ou Twilio/Z-API para WhatsApp) e é um passo à parte. Assim que
tiver essas contas, é só avisar que eu conecto o envio de verdade.

### Férias — planejamento automático, mapa e sugestão de datas

A tela **Férias** ganhou um painel completo. Ao cadastrar um colaborador o
app já gera o período aquisitivo automaticamente (isso já existia); o que é
novo:

- **Dashboard**: total de colaboradores, férias planejadas, aprovadas,
  próximas (30 dias), conflitos e custo estimado, mais um gráfico de férias
  por mês.
- **Filtros**: Empresa, Unidade, Ano, Mês e Colaborador — afetam o mapa, os
  KPIs e o gráfico juntos.
- **Mapa de férias**: um quadro por mês (como nas imagens de referência),
  colaborador por linha, dia por coluna, com a cor indicando o status —
  🟦 planejada, 🟩 aprovada, 🟥 conflito (dois colaboradores da mesma
  unidade de férias na mesma semana — marcado automaticamente).
- **Gerar previsão do próximo ano** (botão no topo): pra cada colaborador
  com período aquisitivo aberto e sem férias marcada ainda, o app calcula
  sozinho dois períodos de 15 dias com 4 a 6 meses de intervalo, respeitando
  a regra da CLT (não pode começar sexta, sábado, nem nos 2 dias antes de um
  feriado), o prazo legal de concessão e evitando bater com férias de outra
  pessoa da mesma unidade. Quem não coube em nenhuma data válida aparece
  listado, pra programar manualmente.
- **✨ Sugerir férias** (em cada linha do mapa): mostra até 3 opções de data
  já validadas pelas mesmas regras, prontas pra usar com um clique.
- **Valor estimado**: salário ÷ 30 × dias, mais 1/3 constitucional — sempre
  como estimativa, não substitui o cálculo definitivo da folha.
- **🧪 Simulação** (botão no topo da página de Férias, ou
  `/ferias/simulacao`): o simulador avançado de planejamento anual. Cada
  **cenário** tem uma Empresa/Unidade/Ano própria, uma configuração salva
  (modelo de fracionamento — 30, 15+15, 20+10, 14+16, 14+10+6 ou
  personalizado —, dias preferenciais de início, intervalo mínimo/máximo
  entre períodos, capacidade máxima simultânea por unidade e por
  departamento, e a estratégia de priorização: Equilibrada, Vencimento,
  Operacional ou Personalizada com pesos) e uma lista de colaboradores
  elegíveis com período aquisitivo e saldo. Pra cada colaborador o RH pode
  **✍️ Definir manualmente** (escolhe as datas, o sistema calcula o fim e
  valida a regra de fracionamento e a CLT antes de salvar) ou deixar pro
  **🎲 Gerar automaticamente**, que preenche só quem ainda não tem
  definição respeitando feriados, a regra de início da CLT, o intervalo
  entre períodos, a capacidade da equipe e a estratégia escolhida — sempre
  vinculado ao período aquisitivo certo. O **Mapa de férias** do cenário
  tem visão **Calendário** (🟦 real já agendado, 🟩 manual, 🟨 automática,
  🟥 conflito/data inválida, 🟪 feriado) e visão **Lista**, com edição
  direta (✏️ editar) sem sair da tela. Um painel de **alertas** mostra
  colaboradores programados, com conflito, com data inválida, perto do
  limite de concessão, concentração de equipe acima do configurado e saldo
  ainda não programado — cada um clicável pra ver quem está envolvido.
  Botões **⧉ Duplicar cenário** (compara cenário A vs B vs C), **🧹 Limpar
  simulação** e **🎲 Nova simulação** (mantém as férias manuais e regera só
  as automáticas) ajudam a testar várias distribuições. Nada disso mexe no
  mapa oficial — só o botão **✅ Aprovar e converter em programação
  oficial** transforma os períodos do cenário em férias planejadas de
  verdade. Cada cenário também exporta em **PDF** e **Excel**.
- **Relatório gerencial** (na própria página de Férias, acima da lista de
  solicitações): exporta em **PDF** ou **Excel** a lista filtrada pelos
  mesmos filtros do mapa (Empresa/Unidade/Ano/Mês/Colaborador) — Colaborador,
  Período, Dias, Status e Valor estimado.
- **Relatório do colaborador**: botão **⬇️ Gerar previsão de férias** na
  ficha do colaborador (**Colaboradores → clicar no nome**) gera um PDF com
  Empresa, Unidade, os 2 períodos e o valor estimado. Se o colaborador ainda
  não tem férias marcada, o PDF mostra uma prévia calculada na hora (avisando
  que ainda não foi salva).

## 6. Colaboradores — cadastro completo e Ficha de Admissão

A ficha de cada colaborador (tela **Colaboradores → clicar no nome**) ganhou
vários campos novos, organizados em seções: dados pessoais (RG, endereço,
estado civil, raça/cor, grau de instrução), dependentes (lista com nome,
data de nascimento, parentesco, CPF e se é dependente de IR — pode adicionar
quantos precisar), contrato de experiência, uma série de sim/não (adiantamento
de salário, primeiro emprego, insalubridade, periculosidade, quebra de caixa,
gratificação de função), dados bancários, horário de trabalho (grade semanal
editável) e benefícios (vale transporte e vale alimentação/refeição, com a
opção de desconto em folha).

- **Horário de trabalho**: a grade segue o mesmo modelo de planilha usado por
  muitos escritórios de contabilidade — Início/Intervalo/Fim por dia da
  semana. A **carga diária** de cada linha, e as **horas semanais** e
  **horas mensais** no rodapé, são somadas automaticamente conforme você
  digita os horários (não precisa calcular nada na mão). O botão
  "🔁 Repetir" em cada linha copia de uma vez os 4 horários do dia anterior,
  pra não redigitar o mesmo horário em vários dias.

- **Filial/Unidade**: além da Empresa, dá pra vincular o colaborador a uma
  filial específica (cadastrada em **Projeção de Custo**, dentro do card da
  empresa). Isso reflete a estrutura "Empresa e Filial" da Ficha de Admissão.
- **CPF, CNPJ e valores em R$**: em todo o app, esses campos são formatados
  automaticamente enquanto você digita (ex.: digitar `12345678900` já vira
  `123.456.789-00`; digitar `150000` num campo de valor já vira `R$ 1.500,00`).
- **Incluir no processo de integração**: se um colaborador foi cadastrado
  direto em Colaboradores (sem passar pelo pré-cadastro/candidato), aparece
  um botão "➕ Incluir no processo de integração" na ficha dele pra criar o
  checklist de integração manualmente.
- **Excluir colaborador**: exclui em definitivo o cadastro e tudo que está
  ligado a ele (férias, onboarding, processo de integração, documentos etc.).
  Pede duas confirmações seguidas antes de excluir, porque não tem como
  desfazer.
- **Desligar**: agora pede também a data do último dia, o tipo de rescisão e
  o motivo do desligamento.
- **Ficha de Admissão (PDF/Excel)**: na ficha do colaborador tem os botões
  **"Baixar PDF"** e **"Baixar Excel"**, que geram o documento formatado, no
  mesmo modelo usado por contabilidades — pronto pra enviar por e-mail. O
  quadro **Horário de Trabalho** já vem com o total de **Horas semanais** e
  **Horas mensais** somado automaticamente. No PDF, cada campo mostra
  "Rótulo: valor" numa linha só (em vez de rótulo e valor empilhados), as
  faixas de título usam o azul do modelo de referência, e tudo foi calibrado
  pra caber numa única folha nos casos normais — só abre uma segunda página
  como proteção, se a ficha tiver muitos dependentes cadastrados.

## 7. Projeção de Custo — unidades e detalhamento

Dentro de cada card de empresa em **Projeção de Custo**, dá pra:

- Cadastrar **filiais/unidades** daquela empresa (com CNPJ próprio e uma
  política de **Adiantamento salarial** de 20%, 30% ou 40%, se a empresa
  oferecer adiantamento).
- Ver o custo mensal **detalhado** em 4 partes: Remuneração, Benefícios,
  Tributos (INSS patronal + FGTS) e Passivo trabalhista (13º, férias, 1/3 e
  multa rescisória) — além do total, que já aparecia antes.

## 8. Colocar no ar (deploy)

1. Suba este projeto para um repositório no **GitHub** (crie uma conta
   gratuita se não tiver — dá pra logar com Google).
2. Crie uma conta na **Vercel** (https://vercel.com) — login com GitHub.
3. Clique em **Add New → Project**, selecione o repositório.
4. Em **Environment Variables**, adicione as mesmas três variáveis do
   `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   e `SUPABASE_SERVICE_ROLE_KEY`).
5. Clique em **Deploy**. Em ~1 minuto o app estará no ar em um link
   `seuapp.vercel.app` (dá pra depois apontar um domínio próprio).

## 9. Backup

- **Automático:** o Supabase já faz backup diário do banco de dados
  automaticamente no plano gratuito (e retenção maior nos planos pagos).
- **Manual (segunda camada):** dentro do app, o botão **"Exportar backup"**
  na barra lateral baixa um arquivo `.json` com todos os dados. Recomendo
  baixar esse arquivo periodicamente (ex.: 1x por semana) e salvar numa
  pasta do Google Drive.

## Design

O visual foi atualizado (cores, tipografia, espaçamento e cards) inspirado em
referências de mercado de sistemas de RH. As decisões de estilo ficam em dois
lugares só, então dá pra ajustar o app inteiro de uma vez:

- `tailwind.config.ts` → paleta de cores:
  - `brand` (verde-água): cor de destaque — links, foco, ícones, item ativo do menu.
  - `ink` (navy): fundo escuro — menu lateral, telas públicas de pré-cadastro, login.
  - `gold` (dourado): reservado pro botão de **ação principal** de cada tela
    (ex.: "Enviar pré-cadastro"). Use no máximo 1 por página, senão perde o efeito.
  - Fontes: títulos em "Baloo 2" (arredondada, `font-display`), texto normal em "Inter".
- `app/globals.css` → os componentes reutilizáveis (`.card`, `.btn-primary`,
  `.btn-secondary`, `.btn-cta`, `.input`, `.label`, `.badge`, `.icon-chip`).
  Como quase toda tela usa essas classes em vez de estilo solto, mudar aqui
  já reflete em todo o sistema automaticamente.

Para trocar as cores por uma identidade visual própria no futuro, basta editar
os valores hexadecimais em `tailwind.config.ts` — o resto do app se adapta sozinho.

## Estrutura do projeto

```
app/(app)/       páginas internas (protegidas por login)
app/login/       tela de login
app/pre-cadastro/[token]/  formulário público do candidato (sem login)
app/api/backup/  rota que gera o export de backup
app/api/ficha-admissao/[id]/pdf/     rota que gera o PDF da Ficha de Admissão
app/api/ficha-admissao/[id]/excel/   rota que gera o Excel da Ficha de Admissão
app/api/ferias/[colaboradorId]/pdf/  rota que gera o PDF "Gerar previsão de férias" de um colaborador
app/api/ferias/relatorio/pdf/        rota que gera o PDF do relatório gerencial de férias (filtrado)
app/api/ferias/relatorio/excel/      rota que gera o Excel do relatório gerencial de férias (filtrado)
app/api/ferias/simulacao/[cenarioId]/pdf/    rota que gera o PDF de 1 cenário de simulação
app/api/ferias/simulacao/[cenarioId]/excel/  rota que gera o Excel de 1 cenário de simulação
app/(app)/ferias/simulacao/  tela do simulador avançado de férias (cenários, config, mapa/lista, alertas)
components/      componentes de UI reutilizáveis
components/campos/  campos de formulário com máscara automática (moeda, CPF/CNPJ)
components/integracao/  linha do tempo e painéis do Processo de Integração (client components)
components/ferias/  mapa de férias, gráfico, botão de sugestão, botão de planejamento automático, e o simulador
  (ConfigSimulacaoForm, DefinirManualForm, GerarAutomaticoBotao, MapaSimulacao, EditarPeriodosSimulados)
lib/actions.ts   escrita no banco (server actions) das telas internas
lib/ferias-calculos.ts  motor de férias: regra da CLT, valor estimado, sugestão de datas e detecção de conflito
lib/simulacao-ferias.ts  motor do simulador avançado: modelos de fracionamento, validação legal, busca de datas com
  preferências/capacidade, estratégias de priorização
lib/ferias-relatorio.ts  monta os dados da previsão do colaborador, do relatório gerencial e do relatório de simulação
  (usado pelos PDFs/Excel de férias)
lib/actions-candidatos.ts  server actions do pré-cadastro (RH + fluxo público)
lib/actions-integracao.ts  server actions do Processo de Integração (etapas, cronômetro, avaliação)
lib/ficha-admissao.ts  monta os dados da Ficha de Admissão (usado pelo PDF e pelo Excel)
lib/formatadores.ts  formatação de CPF, CNPJ e moeda (R$)
lib/supabase-admin.ts  cliente com service role, só pro fluxo público
lib/csv.ts       parser de CSV + mapeamento de colunas do Google Forms
lib/calculos.ts  regras de negócio (custo de folha, prazos legais, experiência, labels da Ficha de Admissão)
supabase/schema.sql  schema inicial do banco de dados
supabase/migration_002_pre_cadastro.sql  tabelas + bucket do pré-cadastro
supabase/migration_003_processo_integracao.sql  tabelas do Processo de Integração
supabase/migration_004_ficha_admissao.sql  unidades, dependentes e campos da Ficha de Admissão
supabase/migration_005_arquivar_painel.sql  saída automática/manual do Painel para Efetivado(a)/Não efetivado(a)
supabase/migration_006_calendario_avancado.sql  cor, repetição, alerta por e-mail e config de WhatsApp do Calendário
supabase/migration_007_ferias_avancado.sql  cenários de simulação, status planejada, valor estimado e base de feriados
supabase/migration_008_simulacao_avancada.sql  cenários com empresa/unidade/ano/config, e quem definiu cada período
  simulado (manual ou automático)
types/db.ts      tipos TypeScript do domínio
```

## Módulos incluídos nesta primeira versão

Dashboard · Calendário Geral · Pré-cadastro de candidato (link público +
importação via Google Forms) · Processo de Integração / Painel de Integração
(fluxo automático, cronômetro, bloqueio por etapa, avaliação dos 90 dias) ·
Colaboradores (CLT e PJ no mesmo cadastro, com Ficha de Admissão completa,
dependentes, horário de trabalho, exclusão e desligamento detalhado) ·
Férias + Situação Aquisitiva · Aniversários (com empresa) · Projeção de
Custo, Empresas/Unidades e Filiais (faturamento, absenteísmo, performance,
treinamento, clima, custo detalhado por empresa) · Ficha de Admissão em
PDF e Excel, pronta pra mandar pra contabilidade · Campos com máscara
automática de CPF, CNPJ e moeda.

## Deixado para uma fase 2 (ver decisão de escopo)

Reuniões de Liderança, Plano de Cargos e Salários, Benefícios, Ações e
Cursos de RH, Convenção Coletiva, Calendário DP separado, envio real de
lembretes por e-mail/WhatsApp (exige backend + credenciais próprias de
WhatsApp Business API), organograma completo de Empresas e Departamentos.
Na Ficha de Admissão em PDF/Excel, o layout segue as mesmas seções e campos
do modelo enviado, mas não é uma cópia pixel a pixel do arquivo original —
dá pra ajustar o visual (fontes, cores, espaçamento) depois, editando
`app/api/ficha-admissao/[id]/pdf/route.ts`.
