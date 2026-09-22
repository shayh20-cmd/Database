
const LIST_NUM_RE=/^(d+).s/;
const LIST_DOT_RE=/^•s/;
function listContinueOnEnter(ta){
const val=ta.value;const pos=ta.selectionStart;
const lineStart=val.lastIndexOf('
',pos-1)+1;
const line=val.slice(lineStart,pos);
const mNum=line.match(LIST_NUM_RE);
const mDot=!mNum&&line.match(LIST_DOT_RE);
if(!mNum&&!mDot)return null;
const markerLen=(mNum||mDot)[0].length;
if(line.slice(markerLen).trim()==='')return{value:val.slice(0,lineStart)+val.slice(pos),pos:lineStart};
const nextMarker=mNum?(parseInt(mNum[1],10)+1)+'. ':'• ';
const insertion='
'+nextMarker;
return{value:val.slice(0,pos)+insertion+val.slice(pos),pos:pos+insertion.length};
}
function listInsertMarker(ta,mode){
const val=ta.value;const pos=ta.selectionStart;
const lineStart=val.lastIndexOf('
',pos-1)+1;
const lineSoFar=val.slice(lineStart,pos);
const marker=mode==='numbered'?'1. ':'• ';
const insertion=(lineSoFar.trim()===''?'':'
')+marker;
return{value:val.slice(0,pos)+insertion+val.slice(pos),pos:pos+insertion.length};
}
function applyListResult(ta,setValue,result){
if(!result)return;
setValue(result.value);
requestAnimationFrame(()=>{if(document.activeElement===ta)ta.setSelectionRange(result.pos,result.pos);});
}
function makeListKeyDown(setValue){
return e=>{
if(e.key!=='Enter'||e.shiftKey)return;
const result=listContinueOnEnter(e.target);
if(!result)return;
e.preventDefault();
applyListResult(e.target,setValue,result);
};
}
function ListContextMenu({pos,onPick,onClose}){
if(!pos)return null;
const itemStyle={display:'block',width:'100%',textAlign:'right',padding:'7px 12px',border:'none',background:'none',borderRadius:6,fontSize:12.5,fontFamily:'inherit',color:'var(--text)',cursor:'pointer'};
return ReactDOM.createPortal(React.createElement(React.Fragment,null,
React.createElement("div",{onClick:onClose,style:{position:'fixed',inset:0,zIndex:10000}}),
React.createElement("div",{style:{position:'fixed',top:pos.y,left:pos.x,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 6px 24px rgba(0,0,0,.16)',zIndex:10001,minWidth:180,padding:4,direction:'rtl'}},
React.createElement("button",{onClick:()=>onPick('numbered'),style:itemStyle},"1. רשימה ממוספרת"),
React.createElement("button",{onClick:()=>onPick('bullets'),style:itemStyle},"• רשימת תבליטים")
)
),document.body);
}
