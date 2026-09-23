import 'server-only';
import {createRequire} from 'node:module';
import {createWorker,OEM,PSM} from 'tesseract.js';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {parseInvoiceText,type ExtractedLine} from './parse';
import {positionedInvoice} from './layout';
const require=createRequire(import.meta.url);
let running=false;
/** Local, server-side OCR; no invoice bytes or keys are sent to a third party. */
export async function extractDocument(bytes:Uint8Array,mime:string){
 if(running)throw new Error('Scanner is busy. Retry scanning shortly, or enter the products manually.');
 const positionalLines:ExtractedLine[]=[];
 running=true;let worker:Awaited<ReturnType<typeof createWorker>>|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
 const recognize=async(image:Buffer)=>{
  worker??=await createWorker('eng',OEM.LSTM_ONLY,{langPath:require('@tesseract.js-data/eng').langPath,cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{}});
  await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
  const read=async()=>{const result=await worker!.recognize(image,{}, {text:true,blocks:true});const words=(result.data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words)));return positionedInvoice(words.map(w=>({str:w.text,transform:[1,0,0,1,w.bbox.x0,-(w.bbox.y0+w.bbox.y1)/2],width:w.bbox.x1-w.bbox.x0})),7);};
  let layout=await read();
  // Boxed tables can disappear in automatic page segmentation. Retry sparse text,
  // retaining actual word positions and choosing it only when product evidence improves.
  if(!layout.lines.length&&!parseInvoiceText(layout.text).lines.length){await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});const sparse=await read();if(sparse.lines.length||parseInvoiceText(sparse.text).lines.length)layout=sparse;}
  positionalLines.push(...layout.lines);return layout.text;

 };
 const work=async()=>{
  let text='';
  if(mime==='application/pdf'){
   const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
   const loading=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
   const pdf=await loading.promise;
   try{
    if(pdf.numPages>5)throw new Error('Scan up to five pages per invoice. Upload a shorter PDF or enter products manually.');
    for(let n=1;n<=pdf.numPages;n++){
     const page=await pdf.getPage(n);const content=await page.getTextContent();const layout=positionedInvoice(content.items.filter(i=>'str'in i));let pageText=layout.text;positionalLines.push(...layout.lines);
     if(pageText.replace(/\s/g,'').length<30){const original=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.min(3,2600/Math.max(original.width,original.height))});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas:canvas as unknown as HTMLCanvasElement,canvasContext:canvas.getContext('2d') as unknown as CanvasRenderingContext2D,viewport}).promise;pageText=await recognize(canvas.toBuffer('image/png'));}
     text+=pageText+'\n';page.cleanup();
    }
   }finally{await loading.destroy();}
  }else{const img=await loadImage(Buffer.from(bytes));if(img.width*img.height>20000000)throw new Error('Resize the image to 20 megapixels or less.');const scale=Math.min(3,2000/img.width);if(scale>1){const canvas=createCanvas(Math.round(img.width*scale),Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);text=await recognize(canvas.toBuffer('image/png'));}else text=await recognize(Buffer.from(bytes));}
  text=text.slice(0,100000);const extraction=parseInvoiceText(text);if(positionalLines.length){extraction.lines=positionalLines;extraction.warnings=extraction.warnings.filter(w=>!w.startsWith('No product rows'));}return {text,extraction};
 };
 try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Scanning timed out. Enter products manually or try a clearer, shorter document.')),90000);})]);}
 finally{if(timer)clearTimeout(timer);await worker?.terminate();running=false;}
}
