/*
  Sport Challenge – browser app
  The app uses Supabase Auth with a publishable key.
  Sessions are persisted by supabase-js in the browser.
*/

let sb = null;
let currentUser = null;
let profiles = {};
let activities = [];
let penalties = [];
let expenses = [];

const $ = id => document.getElementById(id);
const fmtMoney = n => new Intl.NumberFormat("de-DE", {style:"currency", currency:"EUR"}).format(n || 0);
const fmtDate = d => new Intl.DateTimeFormat("de-DE", {day:"2-digit", month:"2-digit", year:"numeric"}).format(new Date(d+"T12:00:00"));
const weekStart = d => {
  const x = new Date(d+"T12:00:00");
  const day = (x.getDay()+6)%7;
  x.setDate(x.getDate()-day);
  return x.toISOString().slice(0,10);
};
const today = () => new Date().toISOString().slice(0,10);
const nameOf = id => profiles[id]?.display_name || "Unbekannt";

function setLoginMessage(message, isError = true) {
  const el = $("loginError");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error", !!isError);
}

function setLoginBusy(busy) {
  const button = document.querySelector('#loginForm button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? "Anmeldung läuft …" : "Einloggen";
}

function getSupabaseClient() {
  if (sb) return sb;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error(
      "Die Supabase-Bibliothek wurde nicht geladen. Bitte die Seite einmal neu laden."
    );
  }

  if (!window.SUPABASE_URL || !window.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Die Supabase-Konfiguration fehlt.");
  }

  sb = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  return sb;
}

async function boot() {
  try {
    const client = getSupabaseClient();

    client.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user && !currentUser) {
        await showApp(session.user);
      }
    });

    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    if (data?.session?.user) {
      await showApp(data.session.user);
    }
  } catch (error) {
    console.error("Sport Challenge boot error:", error);
    setLoginMessage(
      `Die App konnte nicht vorbereitet werden: ${error.message || error}`,
      true
    );
  }
}

async function showApp(user) {
  currentUser = user;
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  try {
    await loadAll();
    $("userBadge").textContent =
      `${nameOf(user.id)}${profiles[user.id]?.is_admin ? " · Admin" : ""}`;
    navigate("dashboard");
  } catch (error) {
    console.error("Sport Challenge load error:", error);
    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    setLoginMessage(
      `Anmeldung erfolgreich, aber die App konnte nicht gestartet werden: ${error.message || error}`,
      true
    );
  }
}

async function loadAll() {
  const client = getSupabaseClient();

  const queries = [
    ["profiles", client.from("profiles").select("*")],
    ["activities", client.from("activities").select("*").order("activity_date", {ascending:false})],
    ["penalties", client.from("penalties").select("*").order("week_start", {ascending:false})],
    ["expenses", client.from("expenses").select("*").order("spent_at", {ascending:false})]
  ];

  const results = await Promise.all(
    queries.map(async ([table, query]) => {
      const result = await query;
      return { table, ...result };
    })
  );

  const failed = results.find(result => result.error);
  if (failed) {
    const e = failed.error;
    throw new Error(
      `Datenbankfehler bei "${failed.table}": ${e.message || "Unbekannter Fehler"}`
    );
  }

  const [p, a, pen, ex] = results;

  profiles = {};
  (p.data || []).forEach(x => profiles[x.id] = x);
  activities = a.data || [];
  penalties = pen.data || [];
  expenses = ex.data || [];

  try {
    renderAll();
  } catch (e) {
    throw new Error(`Fehler beim Aufbau des Dashboards: ${e.message || e}`);
  }
}

function renderAll(){
  renderDashboard();
  renderActivities();
  renderStats();
  renderCash();
}

function personStatus(id){
  const start=new Date("2026-09-28T00:00:00"), now=new Date(); const weeks=[];
  for(let d=new Date(start); d<=now; d.setDate(d.getDate()+7)) weeks.push(d.toISOString().slice(0,10));
  let strikes=0;
  for(const ws of weeks){
    const count=activities.filter(a=>a.user_id===id && weekStart(a.activity_date)===ws).length;
    const missing=Math.max(0,3-count); strikes+=missing;
    if(strikes>=3) strikes-=3;
  }
  const current=activities.filter(a=>a.user_id===id && weekStart(a.activity_date)===weekStart(today())).length;
  return {current,strikes};
}
function renderDashboard(){
  const ids=Object.keys(profiles);
  const totalPaid=penalties.filter(p=>p.paid).reduce((s,p)=>s+Number(p.amount),0);
  const totalExpenses=expenses.reduce((s,e)=>s+Number(e.amount),0);
  $("heroGrid").innerHTML=[
    ["KASSENSTAND",fmtMoney(totalPaid-totalExpenses),"accent"],
    ["SPORTEINHEITEN",activities.length,""],
    ["START","28.09.2026",""]
  ].map(x=>`<div class="hero-card"><div class="label">${x[0]}</div><div class="value ${x[2]}">${x[1]}</div></div>`).join("");
  $("statusGrid").innerHTML=ids.map(id=>{
    const s=personStatus(id), pct=Math.min(100,s.current/3*100), ok=s.current>=3;
    return `<div class="status-card"><div class="person-head"><span class="person-name">${nameOf(id)}</span><span class="status-badge ${ok?"good":""}">${ok?"✓ erfüllt":`${s.current}/3`}</span></div>
      <div class="progress"><i style="width:${pct}%"></i></div><div class="status-meta"><span>Diese Woche</span><span>🔥 ${s.strikes} Strikes</span></div></div>`
  }).join("");
  const recent=activities.slice(0,8);
  $("recentActivities").innerHTML=recent.length?recent.map(activityRow).join(""):`<div class="panel muted">Noch keine Einheiten eingetragen.</div>`;
}
function activityRow(a,own=false){
  return `<div class="activity-row"><div><div class="activity-title">${a.sport}</div><div class="activity-sub">${nameOf(a.user_id)} · ${fmtDate(a.activity_date)}${a.duration_min?` · ${a.duration_min} min`:""}${a.distance_km?` · ${a.distance_km} km`:""}</div></div><div class="activity-number">1×</div>${own?`<button class="delete" onclick="removeActivity('${a.id}')">Löschen</button>`:""}</div>`
}
function renderActivities(){
  $("activityDate").value=today();
  $("myActivities").innerHTML=activities.filter(a=>a.user_id===currentUser.id).map(a=>activityRow(a,true)).join("")||`<div class="panel muted">Du hast noch keine Sporteinheiten eingetragen.</div>`;
}
function renderStats(){
  const ids=Object.keys(profiles);
  const data=ids.map(id=>({id,name:nameOf(id),count:activities.filter(a=>a.user_id===id).length,dur:activities.filter(a=>a.user_id===id).reduce((s,a)=>s+Number(a.duration_min||0),0),dist:activities.filter(a=>a.user_id===id).reduce((s,a)=>s+Number(a.distance_km||0),0),strikes:personStatus(id).strikes,paid:penalties.filter(p=>p.user_id===id&&p.paid).reduce((s,p)=>s+Number(p.amount),0)}));
  $("statsCards").innerHTML=data.map(x=>`<div class="stat-card"><div class="eyebrow">${x.name.toUpperCase()}</div><div class="hero-card value">${x.count}</div><div class="status-meta"><span>Einheiten</span><span>🔥 ${x.strikes} Strikes</span></div></div>`).join("");
  const max=(key)=>Math.max(1,...data.map(x=>x[key]));
  $("comparison").innerHTML=`<table><thead><tr><th>Kategorie</th>${data.map(x=>`<th>${x.name}</th>`).join("")}</tr></thead><tbody>
    ${row("Sporteinheiten",data,"count",max("count"))}
    ${row("Trainingszeit (min)",data,"dur",max("dur"))}
    ${row("Distanz (km)",data,"dist",max("dist"))}
    ${row("Strikes",data,"strikes",Math.max(1,max("strikes")))}
    ${row("Bezahlt",data,"paid",Math.max(1,max("paid")))}
  </tbody></table>`;
}
function row(label,data,key,m){return `<tr><td>${label}</td>${data.map(x=>`<td>${key==="paid"?fmtMoney(x[key]):x[key]}<div class="compare-bar"><i style="width:${Math.min(100,x[key]/m*100)}%"></i></div></td>`).join("")}</tr>`}
function renderCash(){
  const paid=penalties.filter(p=>p.paid).reduce((s,p)=>s+Number(p.amount),0), spent=expenses.reduce((s,e)=>s+Number(e.amount),0);
  const mine=id=>penalties.filter(p=>p.user_id===id&&p.paid).reduce((s,p)=>s+Number(p.amount),0);
  $("cashSummary").innerHTML=[
    ["AKTUELLER KASSENSTAND",fmtMoney(paid-spent),"accent"],
    ["EINZAHLUNGEN",fmtMoney(paid),""],
    ["AUSGABEN",fmtMoney(spent),""]
  ].map(x=>`<div class="hero-card"><div class="label">${x[0]}</div><div class="value ${x[2]}">${x[1]}</div></div>`).join("");
  $("penalties").innerHTML=penalties.length?penalties.map(p=>`<div class="penalty"><span>${nameOf(p.user_id)} · Woche ${fmtDate(p.week_start)} · ${fmtMoney(p.amount)}</span>${p.paid?`<span class="status-badge good">bezahlt</span>`:`<button class="pay-btn" onclick="markPaid('${p.id}')">Als bezahlt</button>`}</div>`).join(""):`<span class="muted">Noch keine Strafzahlungen.</span>`;
  $("expenses").innerHTML=expenses.length?expenses.map(e=>`<div class="activity-row"><div><div class="activity-title">${e.description}</div><div class="activity-sub">${fmtDate(e.spent_at)}</div></div><div class="activity-number">− ${fmtMoney(e.amount)}</div><span></span></div>`).join(""):`<div class="panel muted">Noch keine Ausgaben.</div>`;
}

async function markPaid(id) {
  if (!profiles[currentUser.id]?.is_admin) {
    return alert("Nur Felix kann Zahlungen verwalten.");
  }
  const { error } = await getSupabaseClient()
    .from("penalties")
    .update({paid:true, paid_at:new Date().toISOString()})
    .eq("id", id);
  if (error) {
    alert("Die Zahlung konnte nicht gespeichert werden.");
    console.error(error);
    return;
  }
  await loadAll();
}

async function removeActivity(id) {
  if (!confirm("Sporteinheit wirklich löschen?")) return;
  const { error } = await getSupabaseClient()
    .from("activities")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Die Sporteinheit konnte nicht gelöscht werden.");
    console.error(error);
    return;
  }
  await loadAll();
}

function setupEventHandlers() {
  const loginForm = $("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setLoginMessage("");
      setLoginBusy(true);

      try {
        const username = $("username").value.trim().toLowerCase();
        const password = $("password").value;

        const emailByUsername = {
          felix: "felix@sportchallenge.app",
          yannick: "yannick@sportchallenge.app"
        };

        const email = emailByUsername[username];

        if (!email) {
          setLoginMessage("Bitte Felix oder Yannick eingeben.");
          return;
        }

        if (!password) {
          setLoginMessage("Bitte dein Passwort eingeben.");
          return;
        }

        const client = getSupabaseClient();
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          console.error("Login error:", error);
          setLoginMessage("Benutzername oder Passwort ist nicht korrekt.");
          return;
        }

        if (!data?.user) {
          setLoginMessage("Anmeldung konnte nicht abgeschlossen werden.");
          return;
        }

        // Immediately enter the app. onAuthStateChange also remains active
        // for refreshes and future auth events.
        await showApp(data.user);
      } catch (error) {
        console.error("Login exception:", error);
        setLoginMessage(
          "Beim Einloggen ist ein Fehler aufgetreten. Bitte die Seite neu laden."
        );
      } finally {
        setLoginBusy(false);
      }
    });
  }

  const logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await getSupabaseClient().auth.signOut();
      } finally {
        location.reload();
      }
    });
  }

  const activityForm = $("activityForm");
  if (activityForm) {
    activityForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        const { error } = await getSupabaseClient().from("activities").insert({
          user_id: currentUser.id,
          sport: $("sport").value.trim(),
          activity_date: $("activityDate").value,
          duration_min: $("duration").value || null,
          distance_km: $("distance").value || null
        });

        if (error) throw error;

        activityForm.reset();
        $("activityDate").value = today();
        $("activityMessage").textContent = "Gespeichert ✓";
        await loadAll();
      } catch (error) {
        console.error(error);
        $("activityMessage").textContent =
          "Die Sporteinheit konnte nicht gespeichert werden.";
      }
    });
  }

  const expenseForm = $("expenseForm");
  if (expenseForm) {
    expenseForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!profiles[currentUser.id]?.is_admin) {
        return alert("Nur Felix kann die Kasse verwalten.");
      }

      try {
        const { error } = await getSupabaseClient().from("expenses").insert({
          description: $("expenseDescription").value,
          amount: $("expenseAmount").value,
          spent_at: today(),
          created_by: currentUser.id
        });

        if (error) throw error;

        expenseForm.reset();
        await loadAll();
      } catch (error) {
        console.error(error);
        alert("Die Ausgabe konnte nicht gespeichert werden.");
      }
    });
  }

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.page));
  });
}

function navigate(page) {
  document.querySelectorAll(".page").forEach(x => x.classList.add("hidden"));
  const target = $("page-" + page);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(x =>
    x.classList.toggle("active", x.dataset.page === page)
  );

  $("pageTitle").textContent = {
    dashboard: "Dashboard",
    activities: "Sport eintragen",
    stats: "Statistiken",
    cash: "Kasse"
  }[page] || "Dashboard";
}

document.addEventListener("DOMContentLoaded", () => {
  setupEventHandlers();
  boot();
});
