import 'dotenv/config';
import {configurePush,notificationTick} from '../../src/lib/kitchen/worker';
import {encryptionKey} from '../../src/lib/kitchen/security';
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
configurePush();encryptionKey();
console.info('Cocotte notification worker started.');
while(!stopping){try{await notificationTick();}catch{console.error('Notification queue temporarily unavailable; retrying.');}await new Promise(resolve=>setTimeout(resolve,3000));}
