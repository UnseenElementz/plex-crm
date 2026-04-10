import './globals.css'
import { ReactNode } from 'react'
import Header from '@/components/Header'
import dynamic from 'next/dynamic'
import Script from 'next/script'

const BackgroundAudio = dynamic(() => import('@/components/BackgroundAudio'), { ssr: false })
const ToasterClient = dynamic(() => import('@/components/ToasterClient'), { ssr: false })
const AppBackdrop = dynamic(() => import('@/components/AppBackdrop'), { ssr: false })

export const metadata = {
  title: 'Streamz R Us',
  description: 'Premium media hosting, managed customer access, renewals, and direct support.'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="app-shell min-h-screen overflow-x-hidden text-slate-100">
        <AppBackdrop />
        <div className="relative z-10">
          <Header />
          <main>
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
