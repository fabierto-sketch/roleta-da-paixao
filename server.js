const express=require("express"),http=require("http"),{Server}=require("socket.io"),{Pool}=require("pg"),crypto=require("crypto"),path=require("path");
const {buildBank}=require("./challenges");
const app=express(),server=http.createServer(app),io=new Server(server),pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});
const PORT=process.env.PORT||3000;
app.use(express.json());app.use(express.static(path.join(__dirname,"public")));
const cats=[["romance","❤️ Romance"],["loucuras","🤪 Loucuras"],["confissoes","🤫 Confissões"],["seducao","🔥 Sedução"],["conhecimento","🧠 Conhecimento"],["distancia","🌍 Distância"],["surpresa","🎁 Surpresa"],["tudo","🎡 Tudo ou Nada"]];
const code=()=>crypto.randomBytes(4).toString("hex").slice(0,6).toUpperCase(),key=()=>crypto.randomBytes(20).toString("hex");
async function init(){
 if(!process.env.DATABASE_URL){console.warn("Configure DATABASE_URL no Render.");return;}
 await pool.query(`
 CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,category TEXT NOT NULL,prompt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT NOW(),scores JSONB NOT NULL DEFAULT '{"A":0,"B":0}');
 CREATE TABLE IF NOT EXISTS players(id BIGSERIAL PRIMARY KEY,room_code TEXT REFERENCES rooms(code) ON DELETE CASCADE,player_key TEXT,display_name TEXT,slot TEXT,UNIQUE(room_code,slot));
 CREATE TABLE IF NOT EXISTS used_challenges(room_code TEXT REFERENCES rooms(code) ON DELETE CASCADE,challenge_id TEXT,used_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(room_code,challenge_id));
 CREATE TABLE IF NOT EXISTS custom_challenges(id TEXT PRIMARY KEY,room_code TEXT REFERENCES rooms(code) ON DELETE CASCADE,category TEXT,prompt TEXT);
 CREATE TABLE IF NOT EXISTS history(id BIGSERIAL PRIMARY KEY,room_code TEXT REFERENCES rooms(code) ON DELETE CASCADE,player_slot TEXT,prompt TEXT,category TEXT,played_at TIMESTAMPTZ DEFAULT NOW());`);
 const n=+(await pool.query("SELECT COUNT(*) n FROM challenges")).rows[0].n;
 if(n<1500)for(const c of buildBank())await pool.query("INSERT INTO challenges(id,category,prompt) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[c.id,c.category,c.prompt]);
}
async function player(req){return (await pool.query("SELECT * FROM players WHERE room_code=$1 AND player_key=$2",[req.params.code.toUpperCase(),req.headers["x-player-key"]])).rows[0];}
app.get("/api/status",async(req,res)=>{try{res.json({ok:true,total:+(await pool.query("SELECT COUNT(*) n FROM challenges")).rows[0].n})}catch(e){res.status(503).json({ok:false,error:"Base de dados não ligada."})}});
app.post("/api/rooms",async(req,res)=>{try{if(!process.env.DATABASE_URL)return res.status(503).json({error:"A base de dados PostgreSQL ainda não está ligada."});let c=code();while((await pool.query("SELECT 1 FROM rooms WHERE code=$1",[c])).rowCount)c=code();let k=key(),name=String(req.body.name||"Portuga").slice(0,30);await pool.query("INSERT INTO rooms(code) VALUES($1)",[c]);await pool.query("INSERT INTO players(room_code,player_key,display_name,slot) VALUES($1,$2,$3,'A')",[c,k,name]);res.json({code:c,key:k,slot:"A"});}catch(e){console.error(e);res.status(500).json({error:"Não foi possível criar a sala."})}});
app.post("/api/rooms/join",async(req,res)=>{try{let c=String(req.body.code||"").toUpperCase(),name=String(req.body.name||"Bernardete").slice(0,30);if(!(await pool.query("SELECT 1 FROM rooms WHERE code=$1",[c])).rowCount)return res.status(404).json({error:"Sala não encontrada."});if((await pool.query("SELECT 1 FROM players WHERE room_code=$1 AND slot='B'",[c])).rowCount)return res.status(409).json({error:"A sala já tem dois jogadores."});let k=key();await pool.query("INSERT INTO players(room_code,player_key,display_name,slot) VALUES($1,$2,$3,'B')",[c,k,name]);res.json({code:c,key:k,slot:"B"});}catch(e){console.error(e);res.status(500).json({error:"Não foi possível entrar."})}});
app.get("/api/rooms/:code/state",async(req,res)=>{try{let p=await player(req);if(!p)return res.status(403).json({error:"Acesso não autorizado."});let c=req.params.code.toUpperCase(),r=(await pool.query("SELECT scores FROM rooms WHERE code=$1",[c])).rows[0],names=(await pool.query("SELECT slot,display_name FROM players WHERE room_code=$1 ORDER BY slot",[c])).rows,used=+(await pool.query("SELECT COUNT(*) n FROM used_challenges WHERE room_code=$1",[c])).rows[0].n,total=+(await pool.query("SELECT COUNT(*) n FROM challenges")).rows[0].n + +(await pool.query("SELECT COUNT(*) n FROM custom_challenges WHERE room_code=$1",[c])).rows[0].n,hist=(await pool.query("SELECT player_slot,prompt,category,played_at FROM history WHERE room_code=$1 ORDER BY played_at DESC LIMIT 50",[c])).rows;res.json({scores:r.scores,names,used,total,history:hist,cats});}catch(e){console.error(e);res.status(500).json({error:"Erro ao carregar sala."})}});
app.post("/api/rooms/:code/spin",async(req,res)=>{let client=await pool.connect();try{let p=await player(req);if(!p)return res.status(403).json({error:"Acesso não autorizado."});let c=req.params.code.toUpperCase(),cat=String(req.body.category||"");if(!cats.some(x=>x[0]===cat))return res.status(400).json({error:"Categoria inválida."});await client.query("BEGIN");
let pick=await client.query(`
SELECT id, category, prompt
FROM (
  SELECT id, category, prompt
  FROM challenges x
  WHERE category=$1
    AND NOT EXISTS (
      SELECT 1 FROM used_challenges u
      WHERE u.room_code=$2 AND u.challenge_id=x.id
    )
  UNION ALL
  SELECT id, category, prompt
  FROM custom_challenges x
  WHERE room_code=$2
    AND category=$1
    AND NOT EXISTS (
      SELECT 1 FROM used_challenges u
      WHERE u.room_code=$2 AND u.challenge_id=x.id
    )
) AS available
ORDER BY random()
LIMIT 1
`,[cat,c]);
if(!pick.rowCount){await client.query("COMMIT");return res.status(404).json({error:"Todos os desafios desta categoria já foram utilizados."})}let q=pick.rows[0];await client.query("INSERT INTO used_challenges(room_code,challenge_id) VALUES($1,$2)",[c,q.id]);await client.query("INSERT INTO history(room_code,player_slot,prompt,category) VALUES($1,$2,$3,$4)",[c,p.slot,q.prompt,q.category]);await client.query("COMMIT");io.to(c).emit("challenge",{challenge:q,playerSlot:p.slot});
io.to(c).emit("refresh");
res.json({challenge:q});}catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Erro no sorteio."})}finally{client.release()}});
app.post("/api/rooms/:code/custom",async(req,res)=>{try{let p=await player(req);if(!p)return res.status(403).json({error:"Acesso não autorizado."});let cat=String(req.body.category||""),prompt=String(req.body.prompt||"").trim().slice(0,500);if(!cats.some(x=>x[0]===cat)||prompt.length<5)return res.status(400).json({error:"Escolhe categoria e escreve pelo menos 5 caracteres."});await pool.query("INSERT INTO custom_challenges(id,room_code,category,prompt) VALUES($1,$2,$3,$4)",["custom_"+key(),req.params.code.toUpperCase(),cat,prompt]);res.json({ok:true})}catch(e){res.status(500).json({error:"Não foi possível guardar."})}});
app.post("/api/rooms/:code/score",async(req,res)=>{try{let p=await player(req);if(!p)return res.status(403).json({error:"Acesso não autorizado."});let c=req.params.code.toUpperCase(),delta=Math.max(0,Math.min(1,+req.body.delta||0)),r=(await pool.query("SELECT scores FROM rooms WHERE code=$1",[c])).rows[0],s=r.scores;s[p.slot]=(s[p.slot]||0)+delta;await pool.query("UPDATE rooms SET scores=$1 WHERE code=$2",[JSON.stringify(s),c]);io.to(c).emit("refresh");res.json({scores:s})}catch(e){res.status(500).json({error:"Erro na pontuação."})}});
app.post("/api/rooms/:code/reset",async(req,res)=>{try{let p=await player(req);if(!p)return res.status(403).json({error:"Acesso não autorizado."});await pool.query("DELETE FROM used_challenges WHERE room_code=$1",[req.params.code.toUpperCase()]);res.json({ok:true})}catch(e){res.status(500).json({error:"Erro ao reiniciar ciclo."})}});
io.on("connection",s=>{s.on("join-room",({code})=>s.join(String(code).toUpperCase()));s.on("chat",m=>io.to(String(m.code).toUpperCase()).emit("chat",m));s.on("signal",m=>s.to(String(m.code).toUpperCase()).emit("signal",m.data));});
init().then(()=>server.listen(PORT,()=>console.log("Roleta da Paixão ativa na porta "+PORT))).catch(e=>{console.error(e);process.exit(1)});
