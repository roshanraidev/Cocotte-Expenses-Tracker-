import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest{return {name:'Cocotte Kitchen Intelligence',short_name:'Cocotte',start_url:'/',scope:'/',display:'standalone',background_color:'#faf6ed',theme_color:'#123c2d',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}]};}
