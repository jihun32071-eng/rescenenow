import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../site/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.apk':'application/vnd.android.package-archive'};
const server=http.createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,'http://localhost');
  let pathname=decodeURIComponent(url.pathname);
  // Also exercise the repository subpath used by GitHub Pages.
  if(pathname.startsWith('/rescenenow/'))pathname=pathname.slice('/rescenenow'.length);
  const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(root)||!(await stat(file)).isFile())throw Error('Not found');
  response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  response.end(await readFile(file));
 }catch{response.writeHead(404);response.end('Not found');}
});
server.listen(Number(process.env.PORT||4317),'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:'+server.address().port+'/rescenenow/'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
