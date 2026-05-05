const API='http://localhost:5000/api';let token=localStorage.getItem('lis_token')||'';let lang=localStorage.getItem('lis_lang')||'ar';
function headers(){return {'Content-Type':'application/json','Authorization':'Bearer '+token}}
async function login(){try{const r=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:password.value})});if(!r.ok)throw new Error('Login failed');const d=await r.json();token=d.token;localStorage.setItem('lis_token',token);loginPage.classList.add('d-none');app.classList.remove('d-none');applyLang();loadDashboard();}catch(e){alert('Login failed / فشل الدخول')}}
function logout(){localStorage.removeItem('lis_token');location.reload()}
function showSection(id,el){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('.nav').forEach(a=>a.classList.remove('active'));el.classList.add('active')}
function money(v){return Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2})+' SAR'}
async function loadDashboard(){try{const d=await (await fetch(API+'/dashboard',{headers:headers()})).json();stStudents.textContent=d.students;stContracts.textContent=d.contracts;stPaid.textContent=money(d.paid);stRate.textContent=d.collectionRate+'%';rpStudents.textContent=d.students;rpContracts.textContent=d.contracts;rpRemaining.textContent=money(d.remaining);loadStudents(true)}catch(e){console.log(e)}}
async function createFullStudent(){try{const s={name_ar:name_ar.value,name_en:name_en.value,national_id:national_id.value,gender:gender.value,stage:stage.value,grade:grade.value,class_name:class_name.value,guardian_name:guardian_name.value,guardian_mobile:guardian_mobile.value,email:student_email.value,address:address.value,admission_date:admission_date.value};const sr=await fetch(API+'/students',{method:'POST',headers:headers(),body:JSON.stringify(s)});if(!sr.ok)throw new Error('Student error');const sd=await sr.json();const c={student_id:sd.id,academic_year:academic_year.value,tuition:+tuition.value,registration_fee:+registration_fee.value,discount:+discount.value,vat_percent:+vat_percent.value};const cr=await fetch(API+'/contracts',{method:'POST',headers:headers(),body:JSON.stringify(c)});const cd=await cr.json();await fetch(API+'/installments/generate',{method:'POST',headers:headers(),body:JSON.stringify({contract_id:cd.id,count:+inst_count.value,start_date:start_date.value})});alert(lang==='ar'?'تم حفظ الطالب والعقد والأقساط':'Student, contract and installments saved');loadDashboard();}catch(e){alert('Failed to save / فشل الحفظ: '+e.message)}}
async function loadStudents(recent=false){const rows=await (await fetch(API+'/students',{headers:headers()})).json();const html=rows.map((x,i)=>`<tr><td>${i+1}</td><td>${lang==='ar'?(x.name_ar||x.name_en):(x.name_en||x.name_ar)}</td><td>${x.national_id||''}</td><td>${x.stage||''}</td><td>${x.grade||''}-${x.class_name||''}</td><td>${x.guardian_name||''}</td><td>${x.contract_no||'-'}</td><td>${money(x.contract_total)}</td></tr>`).join('');if(studentsTable)studentsTable.innerHTML=html;if(recentStudents)recentStudents.innerHTML='<div class="table-responsive"><table class="table"><tbody>'+html.slice(0,2000)+'</tbody></table></div>'}
async function loadInstallments(){const rows=await (await fetch(API+'/installments',{headers:headers()})).json();installmentsTable.innerHTML=rows.map((x,i)=>`<tr><td>${i+1}</td><td>${lang==='ar'?(x.name_ar||x.name_en):(x.name_en||x.name_ar)}</td><td>${x.contract_no}</td><td>${x.due_date}</td><td>${money(x.total)}</td><td>${money(x.paid)}</td><td><span class="badge-status ${x.status}">${translateStatus(x.status)}</span></td><td>${x.status!=='paid'?`<button class="btn btn-sm btn-success" onclick="pay(${x.id})">${lang==='ar'?'تسجيل دفع':'Pay'}</button>`:'-'}</td></tr>`).join('')}
async function pay(id){const amount=prompt(lang==='ar'?'اكتب المبلغ المدفوع':'Enter paid amount');if(!amount)return;await fetch(API+'/installments/'+id+'/pay',{method:'POST',headers:headers(),body:JSON.stringify({paid:+amount})});loadInstallments();loadDashboard()}
function translateStatus(s){const ar={paid:'مدفوع',partial:'مدفوع جزئياً',upcoming:'قادم',due:'مستحق',overdue:'متأخر'};const en={paid:'Paid',partial:'Partial',upcoming:'Upcoming',due:'Due',overdue:'Overdue'};return (lang==='ar'?ar:en)[s]||s}
async function loadReports(){await loadDashboard();const r=await (await fetch(API+'/reports/summary',{headers:headers()})).json();collectionsReport.innerHTML='<h5>'+(lang==='ar'?'تحصيل شهري':'Monthly Collection')+'</h5>'+r.collections.map(x=>`<div><b>${x.month}</b><div class="bar"><span style="width:${Math.min(100,(x.paid/(x.due||1))*100)}%">${money(x.paid)} / ${money(x.due)}</span></div></div>`).join('');dueRows.innerHTML=r.due.map(x=>`<tr><td>${x.name_ar}</td><td>${x.due_date}</td><td>${money(x.total-x.paid)}</td><td>${translateStatus(x.status)}</td></tr>`).join('')}
function toggleLang(){lang=lang==='ar'?'en':'ar';localStorage.setItem('lis_lang',lang);applyLang();loadDashboard();}
function applyLang(){document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.querySelectorAll('[data-ar][data-en]').forEach(el=>el.textContent=el.dataset[lang]);if(langBtn)langBtn.textContent=lang==='ar'?'English':'عربي';if(loginLang)loginLang.textContent=lang==='ar'?'English':'عربي'}
function printArea(id){const area=document.getElementById(id).innerHTML;const w=window.open('','','width=1000,height=700');w.document.write(`<html dir="${lang==='ar'?'rtl':'ltr'}"><head><title>Print</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css" rel="stylesheet"><style>body{font-family:Tahoma;padding:25px}table{text-align:center}.print-head{text-align:center;margin-bottom:20px}.print-head img{width:120px}</style></head><body><div class="print-head"><img src="assets/logo.png"><h3>Leadership International Schools</h3></div>${area}</body></html>`);w.document.close();w.print()}
function printCurrent(){const active=document.querySelector('.page.active .printable');if(active)printArea(active.id);else window.print()}
applyLang();if(token){loginPage.classList.add('d-none');app.classList.remove('d-none');loadDashboard()}

function updateContractPreview(){
  const t=Number(document.getElementById('tuition')?.value||0);
  const r=Number(document.getElementById('registration_fee')?.value||0);
  const d=Number(document.getElementById('discount')?.value||0);
  const vatP=Number(document.getElementById('vat_percent')?.value||0);
  const count=Number(document.getElementById('inst_count')?.value||1)||1;
  const before=Math.max(0,t+r-d);
  const vat=before*vatP/100;
  const total=before+vat;
  const per=total/count;
  const fmt=(v)=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2})+' SAR';
  if(document.getElementById('pvTuition')){
    pvTuition.textContent=fmt(t); pvReg.textContent=fmt(r); pvDiscount.textContent=fmt(d);
    pvBeforeVat.textContent=fmt(before); pvVat.textContent=fmt(vat); pvTotal.textContent=fmt(total); pvInstallment.textContent=fmt(per);
  }
}
['tuition','registration_fee','discount','vat_percent','inst_count'].forEach(id=>{
  setTimeout(()=>{const el=document.getElementById(id); if(el) el.addEventListener('input',updateContractPreview)},0);
});
setTimeout(updateContractPreview,200);
