/* Enhance one mounted reading. The Markdown owns all clinical text and the order of sample
 * endings (most specific first). Only disclosures opened on this visit contribute. */
function fdMountCaseRounds(root,isPrintOpened){
  var sample=root.querySelector('[data-rounds-sample]');
  if(!sample)return;
  var account=sample.querySelector('[data-rounds-account]');
  var next=sample.querySelector('[data-rounds-next]');
  var addition=sample.querySelector('template[data-rounds-add]');
  var endings=[].slice.call(sample.querySelectorAll('template[data-rounds-when]'));
  var seen=Object.create(null);
  function record(source){
    var key=source.getAttribute('data-rounds-source');
    if(!source.open||seen[key]||(isPrintOpened&&isPrintOpened(source)))return;
    seen[key]=true;
    if(addition&&account&&seen[addition.getAttribute('data-rounds-add')]){
      account.textContent=addition.content.textContent;
    }
    var ending=endings.find(function(option){
      return option.getAttribute('data-rounds-when').split(/\s+/).every(function(required){return seen[required];});
    });
    if(next&&ending)next.textContent=ending.content.textContent;
  }
  [].forEach.call(root.querySelectorAll('details[data-rounds-source]'),function(source){
    source.addEventListener('toggle',function(){record(source);});
  });
  [].forEach.call(root.querySelectorAll('button[data-rounds-target]'),function(button){
    button.addEventListener('click',function(){
      var target=root.ownerDocument.getElementById(button.getAttribute('data-rounds-target'));
      if(!target||!root.contains(target))return;
      target.focus({preventScroll:true});
      target.scrollIntoView({block:'start'});
    });
  });
}
