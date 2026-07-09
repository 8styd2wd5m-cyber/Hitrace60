{\rtf1\ansi\ansicpg1252\cocoartf2870
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 #!/bin/bash\
\
echo "\uc0\u55357 \u56580  Riavvio HITRACE60..."\
\
PID=$(lsof -ti:3000)\
\
if [ -n "$PID" ]; then\
    echo "\uc0\u55357 \u57041  Chiudo Next.js (PID: $PID)"\
    kill -9 "$PID"\
else\
    echo "\uc0\u8505 \u65039  Nessun processo sulla porta 3000"\
fi\
\
echo "\uc0\u55358 \u56825  Elimino cache .next..."\
rm -rf .next\
\
echo "\uc0\u55357 \u56960  Avvio Next.js..."\
npx pnpm exec next dev -H 0.0.0.0 -p 3000}