import { notFound } from 'next/navigation';
import { OfficialDocument } from '@/components/racing/official-document';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
const single = (value: string | string[] | undefined) => typeof value === 'string' ? value : '';

export default async function DocumentPage({params,searchParams}:{params:Promise<{kind:string}>;searchParams:SearchParams}){
 const {kind}=await params;
 const query=await searchParams;
 // Optional deep link from a form field: ?sheet=<name>&cell=<A1 or A1:B2>.
 if(kind==='esf'||kind==='ases'||kind==='ses')return <OfficialDocument kind={kind} initialSheet={single(query.sheet)} focusCell={single(query.cell)}/>;
 notFound();
}
