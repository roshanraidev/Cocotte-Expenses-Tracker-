// Presentation only: retain every stored character and original step number.
export default function MethodPresentation({text}:{text:string}){
 return <div className="recipe-service-method">{text.split(/(\r\n|\r|\n)/).map((part,index)=>{
  if(/^(\r\n|\r|\n)$/.test(part))return part;
  const numbered=part.match(/^(\s*\d+[.)]\s+)([\s\S]*)$/);
  return <span key={index} className={part==='Before Service'||part==='On Order'?'recipe-method-label':part.trim()?'recipe-method-line':'recipe-method-space'}>{numbered?<><span className="recipe-step-number">{numbered[1]}</span><span>{numbered[2]}</span></>:part}</span>;
 })}</div>;
}
