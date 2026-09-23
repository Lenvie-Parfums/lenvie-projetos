require('dotenv').config();
const fs=require('fs'); const path=require('path'); const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {rejectUnauthorized:false}});
(async()=>{try{await pool.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));console.log('Banco inicializado.');}catch(e){console.error(e);process.exitCode=1;}finally{await pool.end();}})();
