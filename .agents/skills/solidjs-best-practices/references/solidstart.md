# SolidStart Reference

SolidStart は SolidJS の上に構築されたメタフレームワーク。Vite + Nitro（Vinxi 経由）で動作し、CSR / SSR / SSG を柔軟に選べる。

---

## ファイルベースルーティング

`routes/` ディレクトリがルートになる。

```
routes/
├── index.tsx          → /
├── about.tsx          → /about
├── blog/
│   ├── index.tsx      → /blog
│   └── [slug].tsx     → /blog/:slug
├── (auth)/            → URLに影響しないグループ
│   ├── login.tsx      → /login
│   └── register.tsx   → /register
└── [...all].tsx       → キャッチオール
```

**動的セグメント:**

- `[id].tsx` — 必須パラメータ
- `[[id]].tsx` — オプショナルパラメータ
- `[...rest].tsx` — キャッチオール

**レイアウト:** ディレクトリと同名ファイルがラッパーになる。

```tsx
// routes/blog.tsx — blog/* のレイアウト
export default function BlogLayout(props) {
  return (
    <div class="blog-layout">
      <nav>...</nav>
      {props.children}
    </div>
  );
}
```

ルートは必ず `default export` でコンポーネントを返す。

---

## データ取得: query + createAsync

### query() — サーバー関数のキャッシュ・重複排除

```tsx
import { query } from "@solidjs/router";

const getUser = query(async (id: string) => {
  "use server";
  return db.users.findById(id);
}, "user"); // ← キャッシュキー（必須、一意にする）
```

- 同じ引数での重複リクエストを自動排除
- ナビゲーション時に5秒以内なら再利用
- SSR/CSR どちらでも同じ関数が動く

### createAsync() — コンポーネント内で使う

```tsx
import { createAsync } from "@solidjs/router";

function UserProfile(props) {
  const user = createAsync(() => getUser(props.id));

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Show when={user()}>{(u) => <div>{u().name}</div>}</Show>
    </Suspense>
  );
}
```

### preload — ナビゲーション前に事前取得

```tsx
export const route = {
  preload: ({ params }) => getUser(params.id),
};

export default function UserPage(props) {
  const user = createAsync(() => getUser(props.params.id));
  // preload 済みなのでサスペンド時間が短い
  ...
}
```

---

## "use server" — サーバー関数

関数を RPC 化する。クライアントから呼び出せるがサーバーでのみ実行される。

```tsx
// 関数レベル
const savePost = async (data: PostData) => {
  "use server";
  await db.posts.create(data);
};

// ファイルレベル（全関数がサーバー専用になる）
("use server");
export async function getSecretConfig() {
  return process.env.SECRET;
}
```

**ルール:**

- 必ず `async` 関数にする
- 引数・戻り値はシリアライズ可能な値のみ（Seroval でシリアライズ）
- DB やファイルシステムへのアクセスはここに閉じ込める

---

## アクション: action + useAction + useSubmission

フォーム送信やデータ変更に使う。

### action() — ミューテーションの定義

```tsx
import { action, redirect } from "@solidjs/router";

const createPost = action(async (formData: FormData) => {
  "use server";
  const title = formData.get("title") as string;
  const post = await db.posts.create({ title });
  throw redirect(`/posts/${post.id}`);
}, "createPost");
```

### フォームで使う

```tsx
// HTMLフォームとそのまま統合（JSなしでも動く）
<form action={createPost} method="post">
  <input name="title" />
  <button type="submit">作成</button>
</form>
```

### useAction() — プログラムから呼ぶ

```tsx
const submit = useAction(createPost);

<button
  onClick={() => {
    const fd = new FormData();
    fd.set("title", "新しい投稿");
    submit(fd);
  }}
>
  作成
</button>;
```

### useSubmission() — 送信状態を追う

```tsx
const submission = useSubmission(createPost);

<Show when={submission.pending}>
  <p>送信中...</p>
</Show>
<Show when={submission.error}>
  <p>エラー: {submission.error.message}</p>
</Show>
```

**アクション完了後、同じページでアクティブな `query` は自動的に再検証される。**

---

## API ルート

`routes/api/` 以下に置き、HTTP メソッドを named export する。

```tsx
// routes/api/users/[id].ts
import type { APIEvent } from "@solidjs/start/server";

export async function GET({ params }: APIEvent) {
  const user = await db.users.findById(params.id);
  if (!user) return new Response("Not Found", { status: 404 });
  return user; // オブジェクトは自動的に JSON になる
}

export async function PATCH({ params, request }: APIEvent) {
  const body = await request.json();
  const updated = await db.users.update(params.id, body);
  return updated;
}
```

- `GET`, `POST`, `PUT`, `PATCH`, `DELETE` を export できる
- `APIEvent` は `{ request: Request, params, fetch }` を持つ
- UI ルートより API ルートが優先される

---

## ミドルウェア

```tsx
// middleware.ts (プロジェクトルート)
import { createMiddleware } from "@solidjs/start/middleware";

export default createMiddleware({
  onRequest: [
    async ({ request, locals }) => {
      // 認証チェック等
      const session = await getSession(request);
      locals.user = session?.user ?? null;
    },
  ],
});
```

`app.config.ts` で登録:

```ts
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  middleware: "./middleware.ts",
});
```

---

## レンダリングモード

```ts
// app.config.ts
export default defineConfig({
  server: {
    preset: "vercel", // or "netlify", "cloudflare-pages", "node", etc.
  },
});
```

ルート単位で SSG も可能:

```tsx
export const route = {
  // このルートを静的生成
  prerender: true,
};
```

---

## よくある落とし穴

**`"use server"` を付け忘れた関数をクライアントから呼ぶ**
→ DBアクセス等がクライアントバンドルに含まれてしまう。`query()` / `action()` の内部は必ず `"use server"` を付ける。

**`query` のキャッシュキーが重複する**
→ 同名だと別の `query` が同じキャッシュを共有してしまう。キー名はグローバルで一意にする。

**`createAsync` を `Suspense` の外で使う**
→ ローディング中に `undefined` が返る。必ず `<Suspense>` でラップするか `user()` の nullチェックをする。

**アクション後にデータが古いまま**
→ `action` 内でリダイレクトや `revalidate` を指定しないと再検証されない。`throw redirect(path, { revalidate: query.key })` を使う。
