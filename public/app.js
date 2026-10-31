const $=id=>document.getElementById(id);let s=null,socket=null,cat=null,peer=null,stream=null;
const cats=[["romance","❤️ Romance"],["loucuras","🤪 Loucuras"],["confissoes","🤫 Confissões"],["seducao","🔥 Sedução"],["conhecimento","🧠 Conhecimento"],["distancia","🌍 Distância"],["surpresa","🎁 Surpresa"],["tudo","🎡 Tudo ou Nada"]];
const hdr=()=>({"Content-Type":"application/json","x-player-key":s?.key||""});
async function api(url,body){let r=await fetch(url,{method:body?"POST":"GET",headers:hdr(),body:body?JSON.stringify(body):undefined}),d=await r.json();if(!r.ok)throw Error(d.error||"Erro");return d}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function enter(d,name){s={...d,name};localStorage.setItem("roletaSession",JSON.stringify(s));$("home").classList.add("hidden");$("game").classList.remove("hidden");$("room").textContent=d.code;$("customCat").innerHTML=cats.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join("");$("cats").innerHTML=cats.map(c=>`<button data-cat="${c[0]}">${c[1]}</button>`).join("");document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{cat=b.dataset.cat;document.querySelectorAll("[data-cat]").forEach(x=>x.classList.toggle("active",x===b))});socket=io();socket.emit("join-room",{code:d.code});socket.on("refresh",refresh);socket.on("chat",m=>chat(m.name,m.message));socket.on("signal",signal);await refresh()}
$("create").onclick=async()=>{try{let d=await api("/api/rooms",{name:$("createName").value});await enter(d,$("createName").value)}catch(e){$("homeErr").textContent=e.message}};
$("join").onclick=async()=>{try{let d=await api("/api/rooms/join",{code:$("code").value,name:$("joinName").value});await enter(d,$("joinName").value)}catch(e){$("homeErr").textContent=e.message}};
async function refresh(){try{let d=await api(`/api/rooms/${s.code}/state`);$("aName").textContent=d.names.find(x=>x.slot==="A")?.display_name||"Jogador A";$("bName").textContent=d.names.find(x=>x.slot==="B")?.display_name||"À espera...";$("aScore").textContent=d.scores.A||0;$("bScore").textContent=d.scores.B||0;$("used").textContent=`${d.used} de ${d.total} desafios utilizados`; $("history").innerHTML=d.history.map(h=>`<div class="hist"><b>${esc(h.category)}</b> · ${esc(h.prompt)}<br><small>${new Date(h.played_at).toLocaleString("pt-PT")}</small></div>`).join("")||"Ainda sem desafios."}catch(e){$("gameErr").textContent=e.message}}
$("spin").onclick=async()=>{
  if(!cat){
    $("gameErr").textContent="Escolham uma categoria primeiro.";
    return;
  }

  const wheel=document.querySelector(".wheel");
  const spinButton=$("spin");

  spinButton.disabled=true;

  const animation=wheel.animate(
    [
      {transform:"rotate(0deg)"},
      {transform:"rotate(1800deg)"}
    ],
    {
      duration:3500,
      easing:"cubic-bezier(.12,.75,.18,1)"
    }
  );

  try{
    let d=await api(`/api/rooms/${s.code}/spin`,{category:cat});

    await animation.finished;

    $("catName").textContent=cats.find(c=>c[0]===d.challenge.category)[1];
    $("prompt").textContent=d.challenge.prompt;
    $("challenge").classList.remove("hidden");
    $("gameErr").textContent="";

    await refresh();

  }catch(e){
    animation.cancel();
    $("gameErr").textContent=e.message;
  }finally{
    spinButton.disabled=false;
  }
};
$("done").onclick=async()=>{try{await api(`/api/rooms/${s.code}/score`,{delta:1});$("challenge").classList.add("hidden");await refresh()}catch(e){$("gameErr").textContent=e.message}};
$("skip").onclick=()=>{$("challenge").classList.add("hidden");$("spin").click()};
$("saveCustom").onclick=async()=>{try{await api(`/api/rooms/${s.code}/custom`,{category:$("customCat").value,prompt:$("customText").value});$("customText").value="";$("customMsg").textContent="Desafio guardado! ❤️";await refresh()}catch(e){$("customMsg").textContent=e.message}};
$("reset").onclick=async()=>{if(confirm("Reiniciar o ciclo? O histórico fica guardado.")){await api(`/api/rooms/${s.code}/reset`,{});await refresh()}};
$("copy").onclick=async()=>{await navigator.clipboard.writeText(`Vem jogar comigo na Roleta da Paixão ❤️ Código: ${s.code} ${location.origin}/?room=${s.code}`);$("copy").textContent="Copiado!"};
function chat(n,m){let d=document.createElement("div");d.innerHTML=`<b>${esc(n)}:</b> ${esc(m)}`;$("chat").append(d);$("chat").scrollTop=$("chat").scrollHeight}
$("send").onclick=()=>{let m=$("message").value.trim();if(m){socket.emit("chat",{code:s.code,name:s.name,message:m});$("message").value=""}};$("message").onkeydown=e=>{if(e.key==="Enter")$("send").click()};
async function start(){stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});$("local").srcObject=stream;peer=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});stream.getTracks().forEach(t=>peer.addTrack(t,stream));peer.ontrack=e=>$("remote").srcObject=e.streams[0];peer.onicecandidate=e=>{if(e.candidate)socket.emit("signal",{code:s.code,data:{candidate:e.candidate}})};let offer=await peer.createOffer();await peer.setLocalDescription(offer);socket.emit("signal",{code:s.code,data:{description:peer.localDescription}})}
async function signal(d){try{if(!peer){stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});$("local").srcObject=stream;peer=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});stream.getTracks().forEach(t=>peer.addTrack(t,stream));peer.ontrack=e=>$("remote").srcObject=e.streams[0];peer.onicecandidate=e=>{if(e.candidate)socket.emit("signal",{code:s.code,data:{candidate:e.candidate}})}}if(d.description){await peer.setRemoteDescription(d.description);if(d.description.type==="offer"){let a=await peer.createAnswer();await peer.setLocalDescription(a);socket.emit("signal",{code:s.code,data:{description:peer.localDescription}})}}else if(d.candidate)await peer.addIceCandidate(d.candidate)}catch(e){console.error(e)}}
$("call").onclick=()=>start().catch(e=>$("gameErr").textContent="Câmara/microfone: "+e.message);$("hang").onclick=()=>{if(peer)peer.close();peer=null;if(stream)stream.getTracks().forEach(t=>t.stop());$("local").srcObject=null;$("remote").srcObject=null};
let room=new URLSearchParams(location.search).get("room");if(room)$("code").value=room;
async function restoreSession(){
  try {
    let saved = JSON.parse(localStorage.getItem("roletaSession") || "null");

    if (saved && saved.code && saved.key) {
      await api(`/api/rooms/${saved.code}/state`);
      await enter(saved, saved.name || "Jogador");
    }
  } catch(e) {
    localStorage.removeItem("roletaSession");
  }
}

restoreSession();
