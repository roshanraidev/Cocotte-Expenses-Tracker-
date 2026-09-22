import 'server-only';
import {createRequire} from 'node:module';
import {createWorker,OEM} from 'tesseract.js';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {parseInvoiceText} from './parse';
const require=createRequire(import.meta.url);
let running=false;
/** Local, server-side OCR; no invoice bytes or keys are sent to a third party. */
export async function extractDocument(bytes:Uint8Array,mime:string){
 if(running)throw new Error('Scanner is busy. Retry scanning shortly, or enter the products manually.');
 running=true;let worker:Awaited<ReturnType<typeof createWorker>>|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
 const recognize=async(image:Buffer)=>{
  worker??=await createWorker('eng',OEM.LSTM_ONLY,{langPath:require('@tesseract.js-data/eng').langPath,cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{}});
  return (await worker.recognize(image)).data.text;
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
     const page=await pdf.getPage(n);const content=await page.getTextContent();let pageText='';let lastY:number|undefined;
     for(const item of content.items){if(!('str'in item))continue;const y=item.transform[5];if(lastY!==undefined&&Math.abs(y-lastY)>3)pageText+='\n';pageText+=item.str+' ';if(item.hasEOL)pageText+='\n';lastY=y;}
     if(pageText.replace(/\s/g,'').length<30){const original=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.min(2,2200/Math.max(original.width,original.height))});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas:canvas as unknown as HTMLCanvasElement,canvasContext:canvas.getContext('2d') as unknown as CanvasRenderingContext2D,viewport}).promise;pageText=await recognize(canvas.toBuffer('image/png'));}
     text+=pageText+'\n';page.cleanup();
    }
   }finally{await loading.destroy();}
  }else{const img=await loadImage(Buffer.from(bytes));if(img.width*img.height>20000000)throw new Error('Resize the image to 20 megapixels or less.');text=await recognize(Buffer.from(bytes));}
  text=text.slice(0,100000);return {text,extraction:parseInvoiceText(text)};
 };
 try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Scanning timed out. Enter products manually or try a clearer, shorter document.')),90000);})]);}
 finally{if(timer)clearTimeout(timer);await worker?.terminate();running=false;}
}
