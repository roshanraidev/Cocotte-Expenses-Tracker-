'use client';
import {useActionState,useEffect,useId,useRef,useState} from 'react';
import {UploadCloud,FileText,Camera} from 'lucide-react';
import {packagingAction} from '@/app/(protected)/packaging/actions';
const accepted='application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';
export function InvoiceUpload({submissionKey}:{submissionKey:string}){
 const id=useId(),input=useRef<HTMLInputElement>(null);const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 const [state,action,pending]=useActionState(packagingAction,{error:'',success:''});
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 function choose(chosen:File|null){setError('');if(chosen&&(!/\.(pdf|jpe?g|png)$/i.test(chosen.name)||chosen.size>8*1024*1024||!chosen.size)){setError('Choose a PDF, JPG, JPEG or PNG, between 1 byte and 8 MB. Convert HEIC to JPG first.');setFile(null);setPreview('');if(input.current)input.current.value='';return;}setFile(chosen);setPreview(chosen?URL.createObjectURL(chosen):'');}
 return <form action={action} className="space-y-4" data-dirty={file?'true':'false'}><input type="hidden" name="operation" value="upload"/><input type="hidden" name="submissionKey" value={submissionKey}/>
 <div className={`invoice-dropzone ${dragging?'invoice-dropzone-active':''}`} onDragOver={e=>{e.preventDefault();if(!pending)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(pending)return;if(e.dataTransfer.files.length!==1){setError('Choose one invoice file at a time.');return;}const f=e.dataTransfer.files[0];if(input.current){const transfer=new DataTransfer();transfer.items.add(f);input.current.files=transfer.files;}choose(f);}}>
 <UploadCloud aria-hidden="true" size={36}/><h3>Choose your invoice</h3><p>Drop a PDF or photo here, or choose a file below.</p><label htmlFor={id} className="sr-only">Invoice file</label><input ref={input} id={id} name="file" type="file" accept={accepted} disabled={pending} onChange={e=>choose(e.target.files?.[0]??null)}/><p className="flex items-center justify-center gap-2"><Camera size={16} aria-hidden="true"/> On a phone, choose Take Photo or Photo Library.</p><p>PDF, JPG, JPEG, PNG · up to 8 MB · no supplier needed yet</p></div>
 {file&&<section className="invoice-preview"><p className="mb-2 flex items-center gap-2 text-sm"><FileText size={18} aria-hidden="true"/>{file.name}</p>{preview&&(/\.pdf$/i.test(file.name)?<iframe title="Selected invoice PDF preview" src={preview} sandbox="allow-scripts"/>:
 // Browser object URLs preview unsaved files only; originals are stored in PostgreSQL on upload.
 // eslint-disable-next-line @next/next/no-img-element
 <img src={preview} alt="Selected invoice preview"/>)}<p className="mt-2 text-xs text-stone-500">Preview only. Use Upload & review invoice to save the original securely. If your browser cannot display this PDF, you can still upload it.</p></section>}
 {(error||state.error)&&<p role="alert" className="notice">{error||state.error}</p>}<div className="flex flex-wrap gap-3"><button name="entryMode" value="file" className="btn" disabled={pending||!file||!!error}>{pending?'Saving & reading invoice…':'Upload & review invoice'}</button><button name="entryMode" value="manual" className="btn btn-secondary" disabled={pending}>Enter invoice manually</button></div><p className="text-xs text-stone-500">The original is saved before scanning. Next, review supplier, dates and amounts excluding VAT. Nothing counts as spending until you confirm.</p></form>;
}
