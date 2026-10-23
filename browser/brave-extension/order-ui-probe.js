// Structural read-only broker order-form reconnaissance.
// NO clicks, NO orders, NO symbols, NO financial figures, NO DOM dumps.
(() => {
  'use strict';
  const visible=e=>!!e?.getClientRects?.().length;
  const actionRoot=[...document.querySelectorAll(
    'gt-btn-operar,app-componente-dinamico,app-capitales button'
  )].filter(visible);
  const normalized=s=>String(s||'').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const generic=t=>{
    const label=normalized(t).replace(/\s+/g,' ');
    if(/comprar o vender/.test(label))return 'COMPRAR_O_VENDER';
    if(/^comprar$/.test(label))return 'COMPRAR';
    if(/^vender$/.test(label))return 'VENDER';
    if(/^operar$/.test(label))return 'OPERAR';
    if(/ver detalle|detalles/.test(label))return 'DETALLE';
    return null;
  };
  const forms=[...document.querySelectorAll('form,[role="dialog"],mat-dialog-container')]
    .filter(visible);
  const components=[...document.querySelectorAll('gt-btn-operar')].filter(visible);
  const buttonKinds=new Map();
  for(const root of actionRoot){
    for(const node of [root,...root.querySelectorAll?.('button,[role="button"]')||[]]){
      const kind=generic(node.innerText||node.textContent);
      if(kind)buttonKinds.set(kind,(buttonKinds.get(kind)||0)+1);
    }
  }
  return {schema_version:1,captured_at:new Date().toISOString(),
    area:location.hash.startsWith('#/capitales')?'CAPITALES':'OTHER',
    action_widget_count:Math.min(500,components.length),
    visible_form_count:Math.min(50,forms.length),
    action_kinds:Object.fromEntries([...buttonKinds].slice(0,10)),
    // Only aggregate tag names, never classes, selectors, hrefs, values.
    visible_dialog_count:Math.min(50,[...document.querySelectorAll(
      '[role="dialog"],mat-dialog-container'
    )].filter(visible).length),
    inspected_without_clicks:true,submitted_orders:0};
})();
