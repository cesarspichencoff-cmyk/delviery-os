/**
 * Porta SQL — a única coisa que os repositórios conhecem do banco.
 *
 * Os repositórios falam com esta interface, nunca com o driver. É o que
 * mantém a promessa da arquitetura congelada: PostgreSQL é o banco escolhido,
 * mas o domínio não é refém de um SDK. Trocar de provedor hospedado, ou
 * colocar um pool diferente, mexe em UM arquivo.
 *
 * `transaction` é o membro que não pode ser cosmético. A garantia do outbox
 * transacional — fato e mensagem confirmando juntos — depende de os dois
 * comandos correrem na MESMA conexão. Um "cliente" que despacha cada comando
 * numa conexão do pool destrói a garantia sem produzir nenhum erro visível:
 * tudo funciona até o dia em que a máquina cai entre um comando e outro.
 */

export interface SqlRow {
  [column: string]: unknown;
}

export interface SqlClient {
  query<T extends SqlRow = SqlRow>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

export interface TransactionalSqlClient extends SqlClient {
  /**
   * Executa `fn` dentro de uma transação, numa conexão dedicada.
   * Confirma no fim; desfaz em qualquer exceção.
   */
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Adaptador para o driver `pg`
 * ------------------------------------------------------------------ */

/** Assinatura mínima do `pg` que usamos — evita acoplar tipos do driver. */
interface PoolLike {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: SqlRow[] }>;
  connect(): Promise<PoolClientLike>;
  end(): Promise<void>;
  on(evento: "error", ouvinte: (erro: Error) => void): unknown;
}
interface PoolClientLike {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: SqlRow[] }>;
  release(): void;
}

export class PgSqlClient implements TransactionalSqlClient {
  constructor(private readonly pool: PoolLike) {}

  async query<T extends SqlRow = SqlRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const r = await this.pool.query(sql, params);
    return r.rows as T[];
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    const conn = await this.pool.connect();
    // A conexão reservada é o ponto inteiro: todos os comandos de `fn` correm
    // aqui, e não em conexões diferentes do pool.
    const tx: SqlClient = {
      query: async <R extends SqlRow = SqlRow>(s: string, p: readonly unknown[] = []) =>
        (await conn.query(s, p)).rows as R[],
    };
    try {
      await conn.query("BEGIN");
      const resultado = await fn(tx);
      await conn.query("COMMIT");
      return resultado;
    } catch (e) {
      try {
        await conn.query("ROLLBACK");
      } catch {
        // A conexão já pode ter morrido; o ROLLBACK implícito do servidor
        // resolve. Engolir aqui preserva o erro original, que é o que importa.
      }
      throw e;
    } finally {
      conn.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export interface PgConnectionOptions {
  url: string;
  /** Máximo de conexões. O crítico usa poucas e rápidas. */
  max?: number;
  /** Falha rápido em vez de pendurar a requisição esperando conexão. */
  connectionTimeoutMillis?: number;
  /** Corta consulta que travou — sem isso, um lock alheio segura o runtime. */
  statementTimeoutMs?: number;
  /** TLS. Fora de localhost isto é obrigatório e o boot recusa sem ele. */
  ssl?: boolean;
}

/** true quando a URL aponta para a própria máquina. */
export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

/**
 * Cria o cliente. O `pg` é carregado aqui, e só aqui.
 *
 * A recusa de conexão sem TLS para host remoto é `fail-closed` deliberado:
 * credencial e dado de operação atravessando a internet em claro não é uma
 * escolha de configuração, é um defeito. Localhost é liberado porque o
 * PostgreSQL efêmero de teste não tem certificado e exigir TLS ali só
 * empurraria alguém a desligar a checagem por completo.
 */
export async function createPgClient(opts: PgConnectionOptions): Promise<PgSqlClient> {
  const local = isLocalUrl(opts.url);
  const ssl = opts.ssl ?? !local;
  if (!local && !ssl) {
    throw new Error(
      "conexão remota com PostgreSQL sem TLS recusada: defina ssl=true ou use host local",
    );
  }

  type ConstrutorPool = new (cfg: Record<string, unknown>) => PoolLike;
  // O `pg` é CommonJS. Dependendo de como o import dinâmico é compilado, os
  // exports chegam na raiz do namespace ou embaixo de `default` — as duas
  // formas são normais e é o chamador que precisa aguentar ambas.
  const mod = (await import("pg")) as unknown as {
    Pool?: ConstrutorPool;
    default?: { Pool?: ConstrutorPool };
  };
  const Pool = mod.Pool ?? mod.default?.Pool;
  if (typeof Pool !== "function") {
    throw new Error("driver 'pg' não expôs Pool — dependência ausente ou incompatível");
  }

  const pool = new Pool({
    connectionString: opts.url,
    max: opts.max ?? 10,
    connectionTimeoutMillis: opts.connectionTimeoutMillis ?? 5_000,
    // `statement_timeout` no servidor, e não um timer no cliente: só ele
    // interrompe de fato a consulta lá dentro. Um timeout de cliente abandona
    // a resposta enquanto o banco continua trabalhando.
    statement_timeout: opts.statementTimeoutMs ?? 15_000,
    ssl: ssl ? { rejectUnauthorized: true } : undefined,
    application_name: "deliveryos",
  });

  /**
   * Sem este ouvinte o processo MORRE quando o banco cai.
   *
   * O pool emite `error` nas conexões ociosas quando o servidor vai embora, e
   * um evento `error` sem ouvinte derruba o Node inteiro. O efeito prático foi
   * medido: com o PostgreSQL parado, o runtime crítico saía do ar em vez de
   * responder `blocked` — trocando "não consigo gravar agora", que é
   * recuperável e visível, por "sumi", que exige alguém reiniciar na mão.
   *
   * A queda de conexão ociosa não é erro de negócio nem exige ação: quem
   * decide o que fazer é a sonda de saúde, que tenta escrever e reporta o
   * estado real.
   */
  pool.on("error", (erro: Error) => {
    console.error(
      `[postgres] conexão ociosa caiu: ${erro.message} — o pool reconecta; a saúde reporta o estado.`,
    );
  });

  return new PgSqlClient(pool);
}
