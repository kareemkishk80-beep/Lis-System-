require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'lis_secret';
const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new sqlite3.Database(path.join(dbDir, 'school.db'));

app.use(cors());
app.use(express.json());

function run(sql, params=[]) { return new Promise((resolve,reject)=>db.run(sql, params, function(err){err?reject(err):resolve(this)})); }
function all(sql, params=[]) { return new Promise((resolve,reject)=>db.all(sql, params, (err,rows)=>err?reject(err):resolve(rows))); }
function get(sql, params=[]) { return new Promise((resolve,reject)=>db.get(sql, params, (err,row)=>err?reject(err):resolve(row))); }

async function init(){
 await run(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'admin')`);
 await run(`CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY AUTOINCREMENT, name_ar TEXT, name_en TEXT, national_id TEXT, gender TEXT, stage TEXT, grade TEXT, class_name TEXT, guardian_name TEXT, guardian_mobile TEXT, email TEXT, address TEXT, admission_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
 await run(`CREATE TABLE IF NOT EXISTS contracts(id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, contract_no TEXT UNIQUE, academic_year TEXT, tuition REAL, registration_fee REAL, discount REAL, vat_percent REAL, total REAL, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(student_id) REFERENCES students(id))`);
 await run(`CREATE TABLE IF NOT EXISTS installments(id INTEGER PRIMARY KEY AUTOINCREMENT, contract_id INTEGER, installment_no INTEGER, due_date TEXT, amount REAL, vat REAL, total REAL, paid REAL DEFAULT 0, status TEXT DEFAULT 'upcoming', FOREIGN KEY(contract_id) REFERENCES contracts(id))`);
 const admin = await get(`SELECT id FROM users WHERE email=?`, ['admin@lis.school']);
 if(!admin){ await run(`INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)`, ['System Admin','admin@lis.school', bcrypt.hashSync('123456',10), 'admin']); }
}
init();

function auth(req,res,next){
 const h = req.headers.authorization || '';
 const token = h.startsWith('Bearer ') ? h.slice(7) : null;
 if(!token) return res.status(401).json({message:'Unauthorized'});
 try{ req.user = jwt.verify(token, JWT_SECRET); next(); } catch(e){ res.status(401).json({message:'Invalid token'}); }
}

app.get('/api/health', (req,res)=>res.json({ok:true, message:'LIS API is running'}));
app.post('/api/login', async (req,res)=>{
 const {email,password}=req.body;
 const user=await get(`SELECT * FROM users WHERE email=?`,[email]);
 if(!user || !bcrypt.compareSync(password,user.password)) return res.status(401).json({message:'Invalid login'});
 const token=jwt.sign({id:user.id,email:user.email,role:user.role},JWT_SECRET,{expiresIn:'8h'});
 res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role}});
});

app.get('/api/dashboard', auth, async(req,res)=>{
 const s = await get(`SELECT COUNT(*) count FROM students`);
 const c = await get(`SELECT COUNT(*) count, COALESCE(SUM(total),0) total FROM contracts`);
 const p = await get(`SELECT COALESCE(SUM(paid),0) paid, COALESCE(SUM(total-paid),0) remaining FROM installments`);
 const overdue = await get(`SELECT COUNT(*) count FROM installments WHERE status='overdue'`);
 res.json({students:s.count, contracts:c.count, total:c.total, paid:p.paid, remaining:p.remaining, overdue:overdue.count, collectionRate:c.total?Math.round((p.paid/c.total)*100):0});
});

app.get('/api/students', auth, async(req,res)=>{
 const rows=await all(`SELECT s.*, c.id contract_id, c.contract_no, c.total contract_total, c.status contract_status FROM students s LEFT JOIN contracts c ON c.student_id=s.id ORDER BY s.id DESC`);
 res.json(rows);
});

app.post('/api/students', auth, async(req,res)=>{
 const x=req.body;
 const r=await run(`INSERT INTO students(name_ar,name_en,national_id,gender,stage,grade,class_name,guardian_name,guardian_mobile,email,address,admission_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
 [x.name_ar,x.name_en,x.national_id,x.gender,x.stage,x.grade,x.class_name,x.guardian_name,x.guardian_mobile,x.email,x.address,x.admission_date]);
 res.json({id:r.lastID});
});

app.post('/api/contracts', auth, async(req,res)=>{
 const x=req.body;
 const subtotal = Number(x.tuition||0)+Number(x.registration_fee||0)-Number(x.discount||0);
 const total = subtotal + subtotal*Number(x.vat_percent||0)/100;
 const contractNo = x.contract_no || `CON-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
 const r=await run(`INSERT INTO contracts(student_id,contract_no,academic_year,tuition,registration_fee,discount,vat_percent,total,status) VALUES(?,?,?,?,?,?,?,?,?)`,
 [x.student_id,contractNo,x.academic_year,x.tuition,x.registration_fee,x.discount,x.vat_percent,total,'active']);
 res.json({id:r.lastID, contract_no:contractNo, total});
});

app.post('/api/installments/generate', auth, async(req,res)=>{
 const {contract_id,count,start_date}=req.body;
 const c=await get(`SELECT * FROM contracts WHERE id=?`,[contract_id]);
 if(!c) return res.status(404).json({message:'Contract not found'});
 await run(`DELETE FROM installments WHERE contract_id=?`,[contract_id]);
 const total = Number(c.total), n = Number(count||4), amount = Math.round((total/n)*100)/100;
 const start = new Date(start_date || new Date().toISOString().slice(0,10));
 for(let i=1;i<=n;i++){
   const d=new Date(start); d.setMonth(d.getMonth()+(i-1)*3);
   await run(`INSERT INTO installments(contract_id,installment_no,due_date,amount,vat,total,paid,status) VALUES(?,?,?,?,?,?,?,?)`,[contract_id,i,d.toISOString().slice(0,10),amount,0,amount,0,i===1?'due':'upcoming']);
 }
 res.json({ok:true});
});

app.get('/api/installments', auth, async(req,res)=>{
 const rows=await all(`SELECT i.*, c.contract_no, s.name_ar, s.name_en FROM installments i JOIN contracts c ON c.id=i.contract_id JOIN students s ON s.id=c.student_id ORDER BY i.due_date ASC`);
 res.json(rows);
});
app.post('/api/installments/:id/pay', auth, async(req,res)=>{
 const {paid}=req.body; const inst=await get(`SELECT * FROM installments WHERE id=?`,[req.params.id]);
 if(!inst) return res.status(404).json({message:'Not found'});
 const newPaid = Math.min(Number(inst.total), Number(inst.paid||0)+Number(paid||0));
 const status = newPaid >= Number(inst.total) ? 'paid' : 'partial';
 await run(`UPDATE installments SET paid=?, status=? WHERE id=?`,[newPaid,status,req.params.id]);
 res.json({ok:true});
});

app.get('/api/reports/summary', auth, async(req,res)=>{
 const byStage=await all(`SELECT stage, COUNT(*) count FROM students GROUP BY stage`);
 const collections=await all(`SELECT substr(due_date,1,7) month, SUM(total) due, SUM(paid) paid FROM installments GROUP BY substr(due_date,1,7) ORDER BY month`);
 const due=await all(`SELECT i.*, s.name_ar FROM installments i JOIN contracts c ON c.id=i.contract_id JOIN students s ON s.id=c.student_id WHERE i.status!='paid' ORDER BY due_date LIMIT 20`);
 res.json({byStage, collections, due});
});

app.listen(PORT,()=>console.log(`Server running on http://localhost:${PORT}`));
