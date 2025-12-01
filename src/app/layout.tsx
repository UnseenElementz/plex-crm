import './globals.css'
import { ReactNode } from 'react'
import Header from '@/components/Header'
import Script from 'next/script'

export const metadata = {
  title: 'Plex CRM',
  description: 'CRM management for Plex subscriptions'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen text-slate-100 relative overflow-x-hidden">
        <div className="fixed inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-black"></div>
          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-900/20 via-blue-900/10 to-purple-900/20 animate-pulse"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/40 via-transparent to-transparent opacity-30"></div>
        </div>
        
        <div className="fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
        </div>
        
        <div className="relative z-10">
          <Header />
          <main className="animate-fade-in">
            {children}
          </main>
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
