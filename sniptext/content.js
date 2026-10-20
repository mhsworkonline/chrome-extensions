// SnipText content script
if (!window.__snipTextInit) {
  window.__snipTextInit = true;
  var _overlay = null, _proc = null;

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.action === 'startSnip')  { startSnip();          sendResponse(true); }
    if (msg.action === 'showResult') { showResult(msg.text); sendResponse(true); }
    return false;
  });

  function startSnip() {
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _overlay = document.createElement('div'); _overlay.id = 'sniptext-ov';
    var box = document.createElement('div'); box.id = 'sniptext-box';
    var tip = document.createElement('div'); tip.id = 'sniptext-tip';
    tip.textContent = 'Drag to select  |  Esc = cancel';
    _overlay.appendChild(box); _overlay.appendChild(tip);
    document.body.appendChild(_overlay);
    var x0=0, y0=0, on=false;
    _overlay.onmousedown = function(e){ e.preventDefault(); on=true; x0=e.clientX; y0=e.clientY; upd(x0,y0); };
    _overlay.onmousemove = function(e){ if(on) upd(e.clientX,e.clientY); };
    _overlay.onmouseup = function(e){
      if(!on) return; on=false;
      var r={x:Math.min(x0,e.clientX),y:Math.min(y0,e.clientY),w:Math.abs(e.clientX-x0),h:Math.abs(e.clientY-y0)};
      _overlay.remove(); _overlay=null;
      if(r.w<8||r.h<8) return;
      _proc = mktoast('Reading...','sniptext-i');
      chrome.runtime.sendMessage({action:'capture',rect:r,dpr:window.devicePixelRatio||1});
    };
    function upd(x,y){
      var l=Math.min(x0,x),t=Math.min(y0,y),w=Math.abs(x-x0),h=Math.abs(y-y0);
      box.style.setProperty('left',l+'px','important');
      box.style.setProperty('top',t+'px','important');
      box.style.setProperty('width',w+'px','important');
      box.style.setProperty('height',h+'px','important');
      box.style.setProperty('display','block','important');
    }
    document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ if(_overlay){_overlay.remove();_overlay=null;} document.removeEventListener('keydown',esc); } });
  }

  function showResult(text) {
    if(_proc){_proc.remove();_proc=null;}
    var t=(text||'').trim();
    if(!t){ mktoast('No text detected','sniptext-e',3000); return; }
    function execCopy(){
      var a=document.createElement('textarea');
      a.value=t; a.style='position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(a); a.focus(); a.select();
      document.execCommand('copy'); a.remove();
    }
    if(navigator.clipboard && document.hasFocus()){
      navigator.clipboard.writeText(t).catch(execCopy);
    } else {
      execCopy();
    }
    mktoast('Copied: '+(t.length>80?t.slice(0,80)+'...':t),'sniptext-s',4000);
  }

  function mktoast(txt,cls,dur){
    var el=document.createElement('div'); el.className='sniptext-toast '+cls; el.textContent=txt;
    document.body.appendChild(el);
    requestAnimationFrame(function(){el.classList.add('sniptext-show');});
    if(dur) setTimeout(function(){el.classList.remove('sniptext-show');setTimeout(function(){el.remove();},280);},dur);
    return el;
  }
}
