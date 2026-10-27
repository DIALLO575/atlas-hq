import test from 'node:test';
import assert from 'node:assert/strict';
import {signedTusEndpoint,uploadSignedResumable,TUS_CHUNK_BYTES} from '../src/lib/books/signed-resumable-upload.mjs';
const url='https://testproject.supabase.co';
const response=(status,headers={})=>({status,ok:status>=200&&status<300,headers:new Headers(headers)});

test('signed TUS uses the direct Storage host, signed headers, and 6 MiB chunks',async()=>{
 const requests=[],progress=[],file=new Blob([new Uint8Array(TUS_CHUNK_BYTES+5)]);
 const request=async(href,options)=>{
  requests.push([href,options]);
  if(options.method==='POST')return response(201,{Location:'/storage/v1/upload/resumable/sign/upload-id'});
  if(options.method==='PATCH')return response(204,{'Upload-Offset':String(Number(options.headers['Upload-Offset'])+options.body.size)});
  throw new Error('UNEXPECTED');
 };
 await uploadSignedResumable({projectUrl:url,publishableKey:'public',path:'workspace/book/test.pdf',token:'signed',file,onProgress:p=>progress.push(p),request});
 assert.equal(signedTusEndpoint(url),'https://testproject.storage.supabase.co/storage/v1/upload/resumable/sign');
 assert.equal(requests[0][1].headers['x-signature'],'signed');
 assert.match(requests[0][1].headers['Upload-Metadata'],/bucketName /);
 assert.equal(requests[1][1].body.size,TUS_CHUNK_BYTES);
 assert.equal(requests[2][1].body.size,5);
 assert.equal(progress[0],0);
 assert.equal(progress.at(-1),100);
});

test('TUS resumes interrupted mobile PATCH from confirmed server offset',async()=>{
 let patch=0; const requests=[],file=new Blob([new Uint8Array(21)]);
 const request=async(_href,options)=>{
  requests.push(options.method);
  if(options.method==='POST')return response(201,{Location:'/storage/v1/upload/resumable/sign/upload-id'});
  if(options.method==='PATCH'){patch++;throw new Error('mobile connection dropped');}
  if(options.method==='HEAD')return response(200,{'Upload-Offset':'21'});
  throw new Error('UNEXPECTED');
 };
 await uploadSignedResumable({projectUrl:url,publishableKey:'public',path:'test.pdf',token:'signed',file,request});
 assert.equal(patch,1);
 assert.deepEqual(requests,['POST','PATCH','HEAD']);
});

test('TUS does not forward signed token to an untrusted returned Location',async()=>{
 const file=new Blob(['hello']);
 await assert.rejects(uploadSignedResumable({
  projectUrl:url,publishableKey:'public',path:'test.pdf',token:'signed',file,
  request:async()=>response(201,{Location:'https://attacker.example/storage/v1/upload/resumable/sign/pwn'})
 }),/STORAGE_TUS_LOCATION_INVALID/);
});

test('TUS does not retry permanent permission failures',async()=>{
 let patches=0;
 await assert.rejects(uploadSignedResumable({
  projectUrl:url,publishableKey:'public',path:'test.pdf',token:'signed',file:new Blob(['hello']),
  request:async(_href,options)=>options.method==='POST'
   ?response(201,{Location:'/storage/v1/upload/resumable/sign/upload-id'})
   :(patches++,response(403))
 }),/STORAGE_TUS_PATCH_403/);
 assert.equal(patches,1);
});
