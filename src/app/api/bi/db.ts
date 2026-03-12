import { Pool } from "pg";

export const pool = new Pool({
  host: "192.168.0.40",
  port: 5432,
  user: "postgres",
  password: "Odsprt19!",
  database: "E-mails_Eng",
});