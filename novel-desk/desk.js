const $ = id => document.getElementById(id);
const STORAGE_KEY = 'novel-desk-v2';
const LEGACY_KEY = 'novel-desk-v1';
const exampleQuestion = '澪が手紙を隠していた理由を明かしたいけど、今だと唐突。どうつなげればいい？';
const uid = () => crypto.randomUUID();
const dateLabel = value => value ? new Date(value).toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '更新日時なし';
const chars = body => Array.from(body.replace(/\s/g, '')).length;
const seed = {
  title:'雨が止むまで', description:'一通の手紙が、幼なじみの間に隠された秘密をほどいていく。', genre:'現代ドラマ',
  canon:'澪と蓮は幼なじみ。蓮は差出人のいない手紙を探している。\n前話で蓮は、澪が使う青いインクの染みを手紙の封に見つけた。\n伏線：澪は蓮が雨の中で駅を出た夜のことを、まだ話していない。',
  notes:[],
  chapters:[{title:'窓辺の手紙',body:'雨音に紛れて、蓮はもう一度たずねた。\n「手紙、ここに届かなかった？」\n澪は窓辺の引き出しに手を置いた。\n「……どうして、うちにあると思うの？」\n蓮は答えず、古い封筒の青い染みを指でなぞった。', complete:false,messages:[]}]
};
let loadError = '';
let storageBlocked = false;
let revision = null;

function normalizeWork(input) {
  if (!input || typeof input.title !== 'string' || typeof input.canon !== 'string' ||
      !Array.isArray(input.notes) || !input.notes.every(note => typeof note === 'string') ||
      !Array.isArray(input.chapters)) throw Error('作品データの形式を確認してください。');
  return {
    id: typeof input.id === 'string' ? input.id : uid(),
    title:input.title, description:typeof input.description === 'string' ? input.description : '',
    genre:typeof input.genre === 'string' ? input.genre : '未設定',
    status:input.status === 'complete' ? 'complete' : 'writing',
    updatedAt:Number.isFinite(input.updatedAt) ? input.updatedAt : 0,
    canon:input.canon, notes:[...input.notes],
    chapters:input.chapters.map(chapter => {
      if (!chapter || typeof chapter.title !== 'string' || typeof chapter.body !== 'string' ||
          !Array.isArray(chapter.messages)) throw Error('エピソードの形式を確認してください。');
      return {
        id:typeof chapter.id === 'string' ? chapter.id : uid(),
        title:chapter.title,body:chapter.body,complete:chapter.complete === true,
        draftQuestion:typeof chapter.draftQuestion === 'string' ? chapter.draftQuestion : '',
        updatedAt:Number.isFinite(chapter.updatedAt) ? chapter.updatedAt : 0,
        messages:chapter.messages.map(message => {
          if (!message || !['user','assistant'].includes(message.role) || !Array.isArray(message.blocks) ||
              !message.blocks.every(block => typeof block === 'string')) throw Error('相談履歴の形式を確認してください。');
          return {role:message.role,blocks:[...message.blocks],kind:message.kind === 'sample' ? 'sample' : 'ideas',demo:message.demo === true};
        })
      };
    })
  };
}
function load() {
  try {
    revision = localStorage.getItem(STORAGE_KEY);
    if (revision) {
      const saved = JSON.parse(revision);
      if (saved.version !== 2 || !Array.isArray(saved.works)) throw Error();
      return {version:2,works:saved.works.map(normalizeWork)};
    }
    const old = localStorage.getItem(LEGACY_KEY);
    return {version:2,works:[normalizeWork(old ? JSON.parse(old) : seed)]};
  } catch {
    storageBlocked = true;
    loadError = '保存データを読み込めません。元のデータを保護しています。バックアップを確認してください。';
    return {version:2,works:[]};
  }
}
let state = load();
let activeWorkId = null;
let activeChapterId = null;
let view = 'dashboard';
let editingWorkId = null;
let connected = false;
let busy = false;
const work = () => state.works.find(item => item.id === activeWorkId);
const chapter = () => work()?.chapters.find(item => item.id === activeChapterId);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, className, action) {
  const node = el('button', className, text);
  node.type = 'button';
  node.onclick = action;
  return node;
}
function save(changedWork, changedChapter) {
  if (changedWork) changedWork.updatedAt = Date.now();
  if (changedChapter) changedChapter.updatedAt = Date.now();
  try {
    if (storageBlocked || localStorage.getItem(STORAGE_KEY) !== revision) {
      storageBlocked = true;
      $('storage').textContent = '別の画面で変更されています。この画面の編集は「バックアップ」で保存してください。';
      return false;
    }
    const next = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, next);
    revision = next;
    $('storage').textContent = '保存済み';
    return true;
  } catch {
    $('storage').textContent = '保存できません。「バックアップ」で原稿を保存してください。';
    return false;
  }
}
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY && event.newValue !== revision) {
    storageBlocked = true;
    $('storage').textContent = '別の画面で変更があります。編集内容をバックアップしてから再読み込みしてください。';
  }
});
function show(next) {
  view = next;
  for (const name of ['dashboard','workView','editorView']) $(name).hidden = name !== next;
  $('navWorks').setAttribute('aria-current','page');
  window.scrollTo(0,0);
}
function renderDashboard() {
  const query = $('searchWorks').value.trim().toLocaleLowerCase();
  const filter = $('filterWorks').value;
  const works = state.works.filter(item =>
    (item.title + ' ' + item.description).toLocaleLowerCase().includes(query) &&
    (filter === 'all' || item.status === filter)
  ).sort((a,b) => $('sortWorks').value === 'title' ? a.title.localeCompare(b.title,'ja') : b.updatedAt-a.updatedAt);
  $('worksCount').textContent = state.works.length;
  $('worksList').replaceChildren();
  $('emptyWorks').hidden = works.length > 0;
  $('emptyWorks').textContent = state.works.length ? '条件に一致する小説がありません。検索や絞り込みを変更してください。' : '最初の小説を作成して、執筆をはじめましょう。';
  for (const item of works) {
    const row = el('article','work-row');
    const status = el('div','work-state');
    status.append(el('span','status-pill ' + item.status,item.status === 'complete' ? '完結' : '執筆中'),
      el('span','episode-count',item.chapters.length + '話'));
    const info = el('div','work-info');
    info.append(button(item.title || '無題の小説','work-title',()=>openWork(item.id)));
    if (item.description) info.append(el('p','work-description',item.description));
    info.append(el('div','work-meta',item.genre + '　·　' +
      item.chapters.reduce((total,ep)=>total+chars(ep.body),0).toLocaleString()+'文字　·　'+
      (item.updatedAt ? dateLabel(item.updatedAt)+' 更新' : 'このブラウザに保存')));
    const actions = el('div','work-actions');
    actions.append(button('続きを書く','button primary small',()=> {
      activeWorkId = item.id;
      if (!item.chapters.length) return addChapter();
      openEditor(item.chapters.at(-1).id);
    }),button('管理','button quiet small',()=>openWork(item.id)));
    row.append(status,info,actions);
    $('worksList').append(row);
  }
}
function openDashboard() { renderDashboard(); show('dashboard'); }
function openWork(id) {
  activeWorkId = id;
  activeChapterId = null;
  renderWork();
  setTab(false);
  show('workView');
}
function renderWork() {
  const item = work();
  $('workHeading').textContent = item.title || '無題の小説';
  $('workMeta').textContent = item.genre+'　/　'+ (item.status === 'complete'?'完結':'執筆中')+'　/　'+item.chapters.length+'話';
  $('canon').value = item.canon;
  $('episodeList').replaceChildren();
  if (!item.chapters.length) $('episodeList').append(el('div','empty-state','エピソードがまだありません。「新しいエピソード」から書き始められます。'));
  item.chapters.forEach((ep,index)=>{
    const row=el('article','episode-row');
    const info=el('div','episode-info');
    info.append(button(ep.title || '無題のエピソード','episode-title',()=>openEditor(ep.id)));
    info.append(el('div','episode-meta',chars(ep.body).toLocaleString()+'文字　·　'+
      (ep.updatedAt?dateLabel(ep.updatedAt)+' 更新':'下書き')));
    const actions=el('div','episode-actions');
    actions.append(el('span','status-pill '+(ep.complete?'complete':'writing'),ep.complete?'完成':'執筆中'),
      button('編集','button small',()=>openEditor(ep.id)));
    row.append(el('span','episode-number',String(index+1).padStart(2,'0')),info,actions);
    $('episodeList').append(row);
  });
  renderNotes();
}
function setTab(notes) {
  $('episodesPanel').hidden=notes;
  $('notesPanel').hidden=!notes;
  $('episodesTab').setAttribute('aria-selected',String(!notes));
  $('notesTab').setAttribute('aria-selected',String(notes));
}
function renderNotes() {
  $('memoList').replaceChildren();
  if (!work().notes.length) $('memoList').append(el('p','empty-state','相談で気に入った案を「メモに残す」と、ここに保存されます。'));
  work().notes.forEach(note => $('memoList').append(el('div','memo',note)));
}
function openEditor(id) {
  activeChapterId=id;
  const ep=chapter();
  $('editorWorkTitle').textContent=work().title || '無題の小説';
  $('chapterTitle').value=ep.title;
  $('manuscript').value=ep.body;
  $('question').value=ep.draftQuestion;
  $('progress').textContent='';
  updateEditorStatus();
  renderHistory();
  show('editorView');
}
function updateEditorStatus() {
  const ep=chapter();
  $('wordCount').textContent=chars(ep.body).toLocaleString()+'文字';
  $('stage').textContent=ep.complete?'完成':'執筆中';
  $('stage').className='status-pill '+(ep.complete?'complete':'writing');
  $('finish').textContent=ep.complete?'執筆中に戻す':'完成にする';
}
function addChapter() {
  const ep={id:uid(),title:'',body:'',complete:false,messages:[],draftQuestion:'',updatedAt:Date.now()};
  work().chapters.push(ep);
  save(work());
  openEditor(ep.id);
  $('chapterTitle').focus();
}
function workDialog(editId=null) {
  editingWorkId=editId;
  const item=state.works.find(candidate=>candidate.id===editId);
  $('workTitle').value=item?.title || '';
  $('workDescription').value=item?.description || '';
  $('workGenre').value=item?.genre || '未設定';
  if (!$('workGenre').value) $('workGenre').value='未設定';
  $('workStatus').value=item?.status || 'writing';
  $('submitWork').textContent=item?'変更を保存':'小説を作成';
  $('workDialogTitle').textContent=item?'作品情報を編集':'新しい小説';
  $('workDialog').showModal();
  $('workTitle').focus();
}
$('workForm').onsubmit=event=>{
  event.preventDefault();
  const title=$('workTitle').value.trim();
  if(!title){$('workTitle').setCustomValidity('作品名を入力してください。');$('workTitle').reportValidity();return;}
  let item=state.works.find(candidate=>candidate.id===editingWorkId);
  if(!item) {
    item=normalizeWork({title,canon:'',notes:[],chapters:[]});
    state.works.push(item);
  }
  Object.assign(item,{title,description:$('workDescription').value.trim(),genre:$('workGenre').value,status:$('workStatus').value});
  save(item);
  $('workDialog').close();
  openWork(item.id);
};
$('workTitle').oninput=()=> $('workTitle').setCustomValidity('');
$('cancelWork').onclick=()=> $('workDialog').close();
$('newWork').onclick=()=>workDialog();
$('editWork').onclick=()=>workDialog(activeWorkId);
$('navWorks').onclick=openDashboard;
$('backToWorks').onclick=openDashboard;
$('backToWork').onclick=()=>openWork(activeWorkId);
$('newChapter').onclick=addChapter;
$('episodesTab').onclick=()=>setTab(false);
$('notesTab').onclick=()=>setTab(true);
$('searchWorks').oninput=renderDashboard;
$('filterWorks').onchange=renderDashboard;
$('sortWorks').onchange=renderDashboard;
$('canon').oninput=()=>{work().canon=$('canon').value;save(work());};
$('chapterTitle').oninput=()=>{chapter().title=$('chapterTitle').value;save(work(),chapter());};
$('manuscript').oninput=()=>{chapter().body=$('manuscript').value;save(work(),chapter());updateEditorStatus();};
$('question').oninput=()=>{chapter().draftQuestion=$('question').value;save();};
$('finish').onclick=()=>{chapter().complete=!chapter().complete;save(work(),chapter());updateEditorStatus();};
$('preview').onclick=()=>{
  $('previewTitle').textContent=chapter().title || '無題のエピソード';
  $('previewBody').textContent=chapter().body || '本文がまだありません。';
  $('previewDialog').showModal();
};
$('closePreview').onclick=()=> $('previewDialog').close();
$('toggleAssistant').onclick=()=>{
  $('assistantPanel').hidden=!$('assistantPanel').hidden;
  $('toggleAssistant').setAttribute('aria-expanded',String(!$('assistantPanel').hidden));
  $('toggleAssistant').textContent=$('assistantPanel').hidden?'AI相談を開く':'AI相談を閉じる';
};
function renderHistory() {
  const log=$('history');
  const item=work();
  log.replaceChildren();
  if(!chapter().messages.length) log.append(el('div','chat-empty','次の一場面から、一緒に。\n迷っている展開を相談してみましょう。'));
  chapter().messages.forEach(message=>{
    const entry=el('article','message '+message.role);
    entry.append(el('h3','',message.role==='user'?'あなた':message.demo?'サンプル回答':'執筆アシスタント'));
    message.blocks.forEach(block=>{
      const card=el('div','suggestion');
      card.append(el('p','',block));
      if(message.role==='assistant') {
        const actions=el('div','message-actions');
        const remember=button(item.notes.includes(block)?'保存済み':'メモに残す','button quiet small',()=>{
          if(!item.notes.includes(block))item.notes.push(block);
          save(item);remember.disabled=true;remember.textContent='保存済み';
        });
        remember.disabled=item.notes.includes(block);
        actions.append(remember);
        if(message.kind==='ideas')actions.append(button('この案の見本を頼む','button small',()=>{
          chapter().draftQuestion='この案で、会話を3往復ほど、短い地の文つきで見せて。\n\n'+block;
          $('question').value=chapter().draftQuestion;
          save();$('question').focus();
        }));
        card.append(actions);
      }
      entry.append(card);
    });
    log.append(entry);
  });
  log.scrollTop=log.scrollHeight;
}
$('example').onclick=()=>{
  chapter().draftQuestion=exampleQuestion;
  $('question').value=exampleQuestion;
  save();$('question').focus();
};
function confirmSend(context) {
  const dialog=$('consent');
  $('transmission').textContent='相談文、作品名、この話のタイトルと本文（'+context.body.length+'字）、作品ノート（'+context.canon.length+'字）、直近の相談履歴（'+context.recent.length+'件）を Google Gemini に送ります。';
  dialog.returnValue='cancel';
  dialog.showModal();
  return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='send'),{once:true}));
}
$('form').onsubmit=async event=>{
  event.preventDefault();
  const question=$('question').value.trim();
  if(!question || busy)return;
  const item=work();
  const ep=chapter();
  const isSample=/見本|例文|会話を[0-9０-９一二三四五六七八九]/.test(question);
  busy=true;
  $('send').disabled=true;
  let blocks;
  try {
    if(connected) {
      const context={work:item.title,title:ep.title,body:ep.body,canon:item.canon,recent:structuredClone(ep.messages.slice(-6))};
      if(!await confirmSend(context))return;
      $('progress').textContent='相談中…';
      const response=await fetch('/consult',{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(55_000),
        body:JSON.stringify({question,context,kind:isSample?'sample':'ideas'})
      });
      const data=await response.json();
      if(!response.ok)throw Error(data.error || '回答を取得できませんでした。');
      if(!Array.isArray(data.blocks) || !data.blocks.length || !data.blocks.every(value=>typeof value==='string'))throw Error('回答の形式が正しくありません。');
      blocks=data.blocks;
    } else {
      blocks=demo(question,isSample);
    }
    ep.messages.push({role:'user',blocks:[question]},{role:'assistant',blocks,kind:isSample?'sample':'ideas',demo:!connected});
    if(ep.draftQuestion.trim()===question)ep.draftQuestion='';
    save(item);
    if(view==='editorView' && chapter()===ep) {
      $('question').value=ep.draftQuestion;
      renderHistory();
      $('progress').textContent='';
    }
  } catch(error) {
    if(view==='editorView' && chapter()===ep)$('progress').textContent=error.name==='TimeoutError'?'時間がかかっています。しばらくしてからお試しください。':error.message;
    else $('storage').textContent='相談の回答を取得できませんでした。元のエピソードから再試行できます。';
  } finally {
    busy=false;$('send').disabled=false;
  }
};
$('exportData').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
  const link=el('a');
  link.href=url;link.download='小説の作業机-'+new Date().toISOString().slice(0,10)+'.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('importData').onchange=async event=>{
  const file=event.target.files[0];
  if(!file)return;
  try {
    if(file.size>20_000_000)throw Error('20MB以下のバックアップを選んでください。');
    const data=JSON.parse(await file.text());
    const incoming=data.version===2 && Array.isArray(data.works)?data.works:[data];
    const copies=incoming.map(normalizeWork).map(item=>({...item,id:uid(),title:item.title+'（読み込み）',updatedAt:Date.now()}));
    state.works.push(...copies);
    if(save())$('storage').textContent=copies.length+'作品を追加しました';
    openDashboard();
  } catch(error) {
    $('storage').textContent=error instanceof SyntaxError?'バックアップのJSONファイルを選んでください。':error.message;
  } finally {event.target.value='';}
};
openDashboard();
$('storage').textContent=loadError || 'このブラウザに保存';
if(!storageBlocked)save();
if(location.origin==='http://127.0.0.1:4181') {
  fetch('/status').then(response=>response.json()).then(data=>{
    connected=data.connected===true;
    if(connected) {
      $('mode').textContent='Gemini 接続中';
      $('hint').textContent='この話と作品ノートをもとに相談できます。送信内容は相談ごとに確認します。';
    }
  }).catch(()=>{});
}
function demo(question, isSample) {
  if (isSample) {
    if (question.includes('雨の夜')) {
      return ['蓮は窓の向こうを見た。「あの夜も、こんな雨だった」\n「駅を出たあと、どこへ行ったの」\n「どうして駅のことを知ってる？」\n澪は、答えの代わりに窓を閉めた。\n「澪。君はあの手紙を読んだのか」\n「……続きは、明日話す」'];
    }
    return ['「青い染み、君のインクだろ」\n「いつ気づいたの？」\n「さっき。引き出しを押さえたとき」\n澪はゆっくり手を離した。「隠したのは、読ませたくなかったから」\n「何を？」\n「あなたが、あの夜に置いてきたこと」'];
  }
  return [
    '案1　青いインクをきっかけに打ち明ける\n蓮が青い染みと澪のインクを結びつけて問い直す。澪は手紙を隠した理由だけ明かす。\n拾える描写：封筒の青い染み。小さな手がかりが告白につながる。',
    '案2　雨の夜に話をずらし、秘密を次の話へ残す\n澪が駅を出た夜のことを口にしてしまう。蓮は「なぜ知っている？」と問い返す。\n拾える描写：雨音と、澪が語っていない駅の夜。別の疑問を残して話を終えられる。'
  ];
}



