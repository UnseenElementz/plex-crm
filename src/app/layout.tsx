import './globals.css'
import { ReactNode } from 'react'
import Header from '@/components/Header'
import CosmicBackdrop from '@/components/CosmicBackdrop'
import dynamic from 'next/dynamic'
import Script from 'next/script'

export const metadata = {
  title: 'Plex CRM Beta V3',
  description: 'Plex CRM Beta V3 local workspace'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const BackgroundAudio = dynamic(() => import('@/components/BackgroundAudio'), { ssr: false })
  const ToasterClient = dynamic(() => import('@/components/ToasterClient'), { ssr: false })
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen text-slate-100 relative overflow-x-hidden">
        <CosmicBackdrop />
        <div className="relative z-10">
          <Header />
          <main className="animate-fade-in">
            {children}
          </main>
          <BackgroundAudio />
          <ToasterClient />
        </div>
        <Script id="silence-abort-errors" strategy="beforeInteractive">
          {`(function(){
            var e0 = console.error, w0 = console.warn;
            function filter(){
              var args = Array.prototype.slice.call(arguments);
              try{
                var s = String(args[0] || '');
                if(s.indexOf('net::ERR_ABORTED') !== -1 || s.indexOf('?_rsc=') !== -1) return;
              }catch{}
              return (this===console && this.__fn ? this.__fn : e0).apply(console, args);
            }
            console.__fn = e0; console.error = filter.bind(console);
            function filterWarn(){
              var args = Array.prototype.slice.call(arguments);
              try{
                var s = String(args[0] || '');
                if(s.indexOf('net::ERR_ABORTED') !== -1 || s.indexOf('?_rsc=') !== -1) return;
              }catch{}
              return (this===console && this.__w ? this.__w : w0).apply(console, args);
            }
            console.__w = w0; console.warn = filterWarn.bind(console);
            window.addEventListener('error', function(e){
              var msg = String(e && e.message || '');
              if(msg.indexOf('net::ERR_ABORTED') !== -1){ e.preventDefault(); return false; }
            });
            window.addEventListener('unhandledrejection', function(e){
              try{
                var m = String((e && e.reason && e.reason.message) || '');
                if(m.indexOf('net::ERR_ABORTED') !== -1 || m.indexOf('?_rsc=') !== -1){ e.preventDefault(); }
              }catch{}
            });
          })();`}
        </Script>
        
      </body>
    </html>
  )
}
