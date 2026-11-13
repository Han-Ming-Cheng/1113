#!/usr/bin/env python3
"""LifeHub zero-dependency local demo. Python standard library only."""
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import json, mimetypes, sqlite3, uuid

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
DATA = ROOT / '.local'
DATA.mkdir(exist_ok=True)
DB_PATH = DATA / 'lifehub.sqlite3'

def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db

def initialize():
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,amount INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')));
        CREATE INDEX IF NOT EXISTS expenses_user_created ON expenses(user_id,created_at);
        CREATE TABLE IF NOT EXISTS todos(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')));
        CREATE INDEX IF NOT EXISTS todos_user_created ON todos(user_id,created_at);
        CREATE TABLE IF NOT EXISTS water_settings(user_id TEXT PRIMARY KEY,daily_goal INTEGER NOT NULL DEFAULT 2000);
        CREATE TABLE IF NOT EXISTS water_logs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,amount INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')));
        CREATE INDEX IF NOT EXISTS water_user_created ON water_logs(user_id,created_at);
        CREATE TABLE IF NOT EXISTS shopping_items(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,checked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')));
        CREATE INDEX IF NOT EXISTS shopping_user_created ON shopping_items(user_id,created_at);
        CREATE TABLE IF NOT EXISTS habits(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),UNIQUE(user_id,title));
        CREATE TABLE IF NOT EXISTS habit_logs(id TEXT PRIMARY KEY,habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,user_id TEXT NOT NULL,day TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),UNIQUE(habit_id,day));
        CREATE INDEX IF NOT EXISTS habit_logs_user_day ON habit_logs(user_id,day);
        ''')

def ident(): return str(uuid.uuid4())
def today(): return date.today().isoformat()
def month(): return date.today().strftime('%Y-%m')
def clean(s): return str(s).strip()[:120]

class Handler(BaseHTTPRequestHandler):
    server_version = 'LifeHubLocal/1.0'
    def log_message(self, fmt, *args): print('%s - %s' % (self.address_string(), fmt % args))
    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def body_json(self):
        try: return json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
        except Exception: return None
    def api(self, path):
        if path == '/auth/demo' and self.command == 'POST':
            return self.send_json({'accessToken':'lifehub-local-demo-token','mode':'demo'})
        if self.headers.get('Authorization') != 'Bearer lifehub-local-demo-token':
            return self.send_json({'error':'請先登入本機 Demo。'},401)
        user='local-demo-user'; p=path; method=self.command
        try:
            with connect() as db:
                if p == '/state' and method == 'GET':
                    expenses=db.execute("SELECT id,title,amount,created_at FROM expenses WHERE user_id=? AND strftime('%Y-%m',created_at)=? ORDER BY created_at DESC LIMIT 30",(user,month())).fetchall()
                    total=db.execute("SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE user_id=? AND strftime('%Y-%m',created_at)=?",(user,month())).fetchone()['n']
                    todos=db.execute('SELECT id,title,done,created_at FROM todos WHERE user_id=? ORDER BY done,created_at DESC LIMIT 100',(user,)).fetchall()
                    water=db.execute("SELECT COALESCE(SUM(amount),0) n FROM water_logs WHERE user_id=? AND date(created_at)=?",(user,today())).fetchone()['n']
                    setting=db.execute('SELECT daily_goal FROM water_settings WHERE user_id=?',(user,)).fetchone()
                    shopping=db.execute('SELECT id,title,checked,created_at FROM shopping_items WHERE user_id=? ORDER BY checked,created_at DESC',(user,)).fetchall()
                    habits=db.execute('SELECT id,title,created_at FROM habits WHERE user_id=? ORDER BY created_at',(user,)).fetchall()
                    enriched=[]
                    for h in habits:
                        days={r['day'] for r in db.execute('SELECT day FROM habit_logs WHERE user_id=? AND habit_id=? ORDER BY day DESC LIMIT 400',(user,h['id']))}
                        cursor=date.today() if today() in days else date.today()-timedelta(days=1); streak=0
                        while cursor.isoformat() in days: streak+=1; cursor-=timedelta(days=1)
                        enriched.append({**dict(h),'streak':streak,'checkedToday':today() in days})
                    return self.send_json({'demo':True,'expenses':[dict(x) for x in expenses],'expenseTotal':total,'todos':[dict(x) for x in todos],'waterToday':water,'waterGoal':setting['daily_goal'] if setting else 2000,'shopping':[dict(x) for x in shopping],'habits':enriched,'today':today(),'month':month()})
                data=self.body_json() if method in ('POST','PATCH','PUT') else {}
                if not isinstance(data,dict): return self.send_json({'error':'無法讀取資料。'},400)
                parts=p.strip('/').split('/')
                if p=='/expenses' and method=='POST':
                    title=clean(data.get('title','')); amount=data.get('amount')
                    if not title or not isinstance(amount,int) or amount<1:return self.send_json({'error':'請輸入項目與正整數金額。'},400)
                    db.execute('INSERT INTO expenses(id,user_id,title,amount) VALUES(?,?,?,?)',(ident(),user,title,amount));return self.send_json({'ok':True},201)
                if len(parts)==2 and parts[0]=='expenses' and method=='DELETE':
                    db.execute('DELETE FROM expenses WHERE id=? AND user_id=?',(parts[1],user));return self.send_json({'ok':True})
                if p=='/todos' and method=='POST':
                    title=clean(data.get('title',''))
                    if not title:return self.send_json({'error':'請輸入待辦內容。'},400)
                    item=ident();db.execute('INSERT INTO todos(id,user_id,title) VALUES(?,?,?)',(item,user,title));return self.send_json({'ok':True,'id':item},201)
                if len(parts)==2 and parts[0]=='todos' and method=='PATCH':db.execute('UPDATE todos SET done=? WHERE id=? AND user_id=?',(1 if data.get('done') else 0,parts[1],user));return self.send_json({'ok':True})
                if len(parts)==2 and parts[0]=='todos' and method=='DELETE':db.execute('DELETE FROM todos WHERE id=? AND user_id=?',(parts[1],user));return self.send_json({'ok':True})
                if p=='/water' and method=='POST':
                    amount=data.get('amount')
                    if not isinstance(amount,int) or not 1<=amount<=5000:return self.send_json({'error':'飲水量需介於 1–5000 ml。'},400)
                    db.execute('INSERT INTO water_logs(id,user_id,amount) VALUES(?,?,?)',(ident(),user,amount));return self.send_json({'ok':True},201)
                if p=='/water/goal' and method=='PUT':
                    goal=data.get('goal')
                    if not isinstance(goal,int) or not 250<=goal<=10000:return self.send_json({'error':'目標需介於 250–10000 ml。'},400)
                    db.execute('INSERT INTO water_settings(user_id,daily_goal) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET daily_goal=excluded.daily_goal',(user,goal));return self.send_json({'ok':True})
                if p=='/shopping' and method=='POST':
                    title=clean(data.get('title',''))
                    if not title:return self.send_json({'error':'請輸入購物項目。'},400)
                    item=ident();db.execute('INSERT INTO shopping_items(id,user_id,title) VALUES(?,?,?)',(item,user,title));return self.send_json({'ok':True,'id':item},201)
                if len(parts)==2 and parts[0]=='shopping' and method=='PATCH':db.execute('UPDATE shopping_items SET checked=? WHERE id=? AND user_id=?',(1 if data.get('checked') else 0,parts[1],user));return self.send_json({'ok':True})
                if len(parts)==2 and parts[0]=='shopping' and method=='DELETE':db.execute('DELETE FROM shopping_items WHERE id=? AND user_id=?',(parts[1],user));return self.send_json({'ok':True})
                if p=='/habits' and method=='POST':
                    title=clean(data.get('title',''))
                    if not title:return self.send_json({'error':'請輸入習慣名稱。'},400)
                    try:db.execute('INSERT INTO habits(id,user_id,title) VALUES(?,?,?)',(ident(),user,title))
                    except sqlite3.IntegrityError:return self.send_json({'error':'這個習慣已經存在。'},400)
                    return self.send_json({'ok':True},201)
                if len(parts)==3 and parts[0]=='habits' and parts[2]=='check' and method=='POST':
                    db.execute('INSERT OR IGNORE INTO habit_logs(id,habit_id,user_id,day) SELECT ?,id,?,? FROM habits WHERE id=? AND user_id=?',(ident(),user,today(),parts[1],user));return self.send_json({'ok':True})
                if len(parts)==2 and parts[0]=='habits' and method=='DELETE':db.execute('DELETE FROM habits WHERE id=? AND user_id=?',(parts[1],user));return self.send_json({'ok':True})
                return self.send_json({'error':'找不到此 API。'},404)
        except Exception as e:
            print('API error:',repr(e));return self.send_json({'error':'資料操作失敗。'},500)
    def do_GET(self):
        u=urlparse(self.path)
        if u.path.startswith('/api/'):return self.api(u.path[4:])
        if u.path=='/health':return self.send_json({'ok':True,'mode':'local-demo'})
        target=(PUBLIC / ('index.html' if u.path=='/' else unquote(u.path).lstrip('/'))).resolve()
        if PUBLIC.resolve() not in target.parents or not target.is_file():return self.send_error(404)
        content=target.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(target.name)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)
    def do_POST(self):
        if urlparse(self.path).path.startswith('/api/'):return self.api(urlparse(self.path).path[4:])
        self.send_error(404)
    def do_PUT(self):
        if urlparse(self.path).path.startswith('/api/'):return self.api(urlparse(self.path).path[4:])
        self.send_error(404)
    def do_PATCH(self):
        if urlparse(self.path).path.startswith('/api/'):return self.api(urlparse(self.path).path[4:])
        self.send_error(404)
    def do_DELETE(self):
        if urlparse(self.path).path.startswith('/api/'):return self.api(urlparse(self.path).path[4:])
        self.send_error(404)

if __name__=='__main__':
    initialize()
    host='127.0.0.1'; port=8787
    print(f'LifeHub 本機 Demo：http://{host}:{port}')
    print(f'SQLite 資料：{DB_PATH}')
    print('按 Ctrl-C 停止。')
    ThreadingHTTPServer((host,port),Handler).serve_forever()
