-- migration_024: matrícula do BHBUS separada do cadastro do colaborador.
-- 1) DESFAZ o que a versão anterior desta migration gravou no cadastro (colaboradores.matricula).
-- 2) Cria a tabela vt_matriculas (matrícula por colaborador e operadora).
-- 3) Carrega as matrículas da planilha como matrícula BHBUS. Nomes dos colaboradores NÃO mudam.
-- Rode tudo no Supabase (SQL Editor). A tabela do final mostra o resultado de cada linha.

CREATE TEMP TABLE lista(matricula text, chave text, unidade text);
INSERT INTO lista VALUES
    ('403','ESTER MARILENE DE JESUS SILVA',''),
    ('333','FRANCIELLE','savassi'),
    ('052','MICHELLE','belvedere'),
    ('409','ISABELLY',''),
    ('130','HELLEN',''),
    ('406','GABRIELA CAREY','savassi'),
    ('301','DANIELA',''),
    ('025','LAURA',''),
    ('0035','LAUZENIR',''),
    ('306','FERNANDA','pampulha'),
    ('124','LARISSA',''),
    ('411','LETICIA VITORIA DE OLIVEIRA',''),
    ('408','RAISSA KELLER NEVES DE SOUZA',''),
    ('123','THAIS MONTEIRO',''),
    ('031','ALESSANDRA','savassi'),
    ('057','ELLEN','savassi'),
    ('405','ELZILENE',''),
    ('401','LORRANA','');

CREATE TEMP TABLE achados AS
WITH norm AS (
  SELECT c.id, c.nome, u.nome AS unid,
         translate(upper(c.nome), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') AS nome_n
  FROM colaboradores c
  LEFT JOIN unidades u ON u.id = c.unidade_id
  WHERE c.status <> 'desligado' AND coalesce(c.tipo,'') <> 'PJ'
),
cand AS (
  SELECT l.matricula, l.chave, n.id, n.nome, n.unid
  FROM lista l
  JOIN norm n ON n.nome_n LIKE l.chave || '%'
             AND (l.unidade = '' OR lower(coalesce(n.unid,'')) LIKE '%' || l.unidade || '%')
)
SELECT matricula, chave, min(id::text) AS id, count(*) AS qtd, string_agg(nome || ' (' || coalesce(unid,'sem unidade') || ')', '; ') AS quem
FROM cand GROUP BY matricula, chave;

-- 1) desfaz: limpa do cadastro só onde ficou exatamente o número da planilha
UPDATE colaboradores c SET matricula = NULL
FROM achados a WHERE a.qtd = 1 AND c.id::text = a.id AND c.matricula = a.matricula;

-- 2) tabela própria da matrícula por operadora
CREATE TABLE IF NOT EXISTS vt_matriculas (
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  operadora text NOT NULL,
  matricula text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (colaborador_id, operadora)
);
ALTER TABLE vt_matriculas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vt_matriculas' AND policyname = 'authenticated_full_access') THEN
    CREATE POLICY "authenticated_full_access" ON vt_matriculas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3) carrega a planilha como matrícula BHBUS
INSERT INTO vt_matriculas (colaborador_id, operadora, matricula)
SELECT id::uuid, 'BHBUS', matricula FROM achados WHERE qtd = 1
ON CONFLICT (colaborador_id, operadora) DO UPDATE SET matricula = EXCLUDED.matricula, updated_at = now();

SELECT l.matricula, l.chave AS planilha,
       CASE WHEN a.qtd = 1 THEN 'OK - BHBUS' WHEN a.qtd IS NULL THEN 'NAO ACHEI' ELSE 'VARIOS COM ESSE NOME' END AS situacao,
       a.quem AS colaborador_no_app
FROM lista l LEFT JOIN achados a ON a.chave = l.chave AND a.matricula = l.matricula
ORDER BY situacao DESC, l.chave;
