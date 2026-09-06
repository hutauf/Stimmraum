import type {Metadata,Viewport} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Stimmraum – Platz für deine Gedanken',description:'Persönliche Sprach-Chats. Gedanken aufnehmen, transkribieren und mitnehmen – auch offline.',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg',apple:'/icon-192.png'},appleWebApp:{capable:true,statusBarStyle:'default',title:'Stimmraum'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#7756db'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>;}
