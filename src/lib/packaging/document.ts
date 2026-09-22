import {createHash} from 'node:crypto';
export const MAX_DOCUMENT_BYTES=8*1024*1024;
export function validateDocument(bytes:Uint8Array,filename:string,mime:string){
 if(!bytes.length||bytes.length>MAX_DOCUMENT_BYTES)throw new Error('Upload a file between 1 byte and 8 MB.');
 const b=Buffer.from(bytes);let detected='';
 if(b.subarray(0,5).toString()==='%PDF-')detected='application/pdf';
 else if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)detected='image/jpeg';
 else if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))detected='image/png';
 if(!detected||mime&&mime!==detected&&mime!=='application/octet-stream')throw new Error('Use a genuine PDF, JPG or PNG. HEIC is not supported; export it as JPG/PNG first.');
 const ext=filename.split('.').pop()?.toLowerCase();if(!['pdf','jpg','jpeg','png'].includes(ext??''))throw new Error('Choose a PDF, JPG or PNG file.');
 if(detected==='image/png'&&(b.length<24||b.readUInt32BE(16)*b.readUInt32BE(20)>20000000))throw new Error('Image is too large. Resize to 20 megapixels or less.');
 return {mime:detected,filename:filename.replace(/[^a-zA-Z0-9_. -]/g,'_').slice(-120)||'invoice',sha256:createHash('sha256').update(b).digest('hex'),size:b.length};
}
