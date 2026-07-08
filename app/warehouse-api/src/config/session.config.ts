import session from 'express-session';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MySQLStore = require('express-mysql-session')(session);

// Redis-based session store (đã viết sẵn, hiện đang tắt — xem setup.md mục "Session").
// import { RedisStore } from 'connect-redis';
// import { createClient } from 'redis';
//
// const redisClient = createClient({
//   socket: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) },
//   password: process.env.REDIS_PASSWORD,
// });
// redisClient.connect().catch(console.error);
// const store = new RedisStore({ client: redisClient, prefix: 'terminal-session:' });

export function sessionConfig(): session.SessionOptions {
  const store = new MySQLStore({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    createDatabaseTable: true,
    schema: {
      tableName: 'session_tbl',
    },
  });

  return {
    store,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    },
  };
}
