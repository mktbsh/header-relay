---
name: solidjs-best-practices
description: Best practices for writing and reviewing SolidJS code. Use this skill whenever working with SolidJS — writing components, reviewing code for reactivity bugs, debugging why props or signals aren't updating, or helping with SolidJS patterns. Trigger when users mention createSignal, createEffect, createMemo, createStore, createResource, createContext, Show, For, Switch, SolidJS, or solid-js. Also trigger when users share JSX code using these primitives, ask about converting React patterns to Solid, or ask why their component isn't updating reactively.
license: MIT
metadata:
  author: mktbsh
  version: "1.0.0"
---

## SolidStart

SolidStart（メタフレームワーク）を使う場合は、ルーティング・サーバー関数・アクション・APIルート等の詳細を [`references/solidstart.md`](references/solidstart.md) から読むこと。

---

# SolidJS Best Practices

SolidJS looks like React on the surface but has a fundamentally different execution model. Getting this wrong produces subtle bugs that are hard to debug. The key insight: **component functions run exactly once** — all updates happen through fine-grained reactivity, not re-renders.

## The Mental Model Shift

```tsx
// React: component function re-runs on every state change
function Counter() {
  const [count, setCount] = useState(0);
  console.log("renders every time"); // called on every update
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}

// Solid: component function runs ONCE, JSX tracks signals
function Counter() {
  const [count, setCount] = createSignal(0);
  console.log("runs once on mount");
  // count() in JSX creates a live reactive binding
  return <button onClick={() => setCount((c) => c + 1)}>{count()}</button>;
}
```

This means patterns valid in React can silently break reactivity in Solid.

---

## Signals

Signals are reactive primitives. Call them as functions to read; the call site becomes a reactive dependency.

```tsx
const [count, setCount] = createSignal(0);

count(); // read (reactive)
setCount(5); // write (absolute)
setCount((c) => c + 1); // write (functional, preferred)
```

**Custom equality** — useful to avoid unnecessary updates:

```tsx
const [pos, setPos] = createSignal(
  { x: 0, y: 0 },
  {
    equals: (a, b) => a.x === b.x && a.y === b.y,
  },
);
```

---

## The Destructuring Trap

**Never destructure signals or props outside a reactive context.** This is the most common mistake from React developers.

```tsx
// WRONG — captures value at creation time, loses reactivity
const { name } = props;
const val = count(); // value snapshot, not reactive

// CORRECT — access inside JSX or effects
return <div>{props.name}</div>;
return <div>{count()}</div>;
```

Props are accessed the same way — they're reactive objects, not plain values:

```tsx
// WRONG
function Card({ title, onClick }) { ... }

// CORRECT
function Card(props) {
  return <div onClick={props.onClick}>{props.title}</div>;
}
```

If you need to pass a subset of props forward, use `splitProps`:

```tsx
function Button(props) {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <button class={local.class} {...rest}>
      {local.children}
    </button>
  );
}
```

---

## Memos

Use `createMemo` for derived values that depend on signals. Solid automatically tracks dependencies — no dependency array needed.

```tsx
const fullName = createMemo(() => `${firstName()} ${lastName()}`);
```

- Memos are lazy (compute only when accessed) and cached
- Use for expensive calculations, not simple expressions — `{count() * 2}` in JSX is fine without a memo
- Memos must be pure (no side effects)

---

## Effects

`createEffect` runs a side effect whenever its reactive dependencies change. Dependencies are tracked automatically.

```tsx
createEffect(() => {
  document.title = `${count()} items`;
});

// With cleanup
createEffect(() => {
  const id = setInterval(() => tick(), 1000);
  return () => clearInterval(id); // cleanup runs before next effect
});
```

- Effects run **after** the DOM has updated
- Don't use effects to synchronize state — that's what `createMemo` is for
- Avoid setting signals inside effects without careful thought (infinite loops)

**Escape hatches:**

```tsx
// untrack — read a signal without creating a dependency
createEffect(() => {
  const val = untrack(() => count()); // not tracked
});

// batch — combine multiple signal updates into one flush
batch(() => {
  setA(1);
  setB(2);
  // dependent effects run once, not twice
});
```

---

## Control Flow Components

Use Solid's built-in control flow components instead of JS expressions. They're optimized and maintain correct reactivity.

### Show — conditional rendering

```tsx
<Show when={isLoggedIn()} fallback={<LoginPage />}>
  <Dashboard />
</Show>

// Children function gives you the narrowed value (avoids null checks)
<Show when={user()}>
  {(user) => <Profile name={user().name} />}
</Show>
```

### For — list rendering

```tsx
// For tracks by identity — efficient for dynamic lists
<For each={items()} fallback={<Empty />}>
  {(item, index) => <Item data={item} index={index()} />}
</For>
```

> Use `<Index>` instead when the list is fixed-length but values change — it tracks by position.

### Switch / Match — multi-branch

```tsx
<Switch fallback={<NotFound />}>
  <Match when={status() === "loading"}>
    <Spinner />
  </Match>
  <Match when={status() === "error"}>
    <Error msg={error()} />
  </Match>
  <Match when={status() === "success"}>
    <Data value={data()} />
  </Match>
</Switch>
```

### Dynamic — dynamic component type

```tsx
<Dynamic component={componentMap[type()]} {...props} />
```

**Never use `.map()` directly in JSX for lists** — use `<For>`. It's not just style; `<For>` is DOM-efficient and won't unnecessarily recreate elements.

---

## Stores

For nested or complex state, prefer `createStore` over multiple signals. Stores provide **fine-grained reactivity** at the property level.

```tsx
const [state, setState] = createStore({
  user: { name: "Alice", role: "admin" },
  todos: [{ id: 1, text: "Ship it", done: false }],
});

// Fine-grained path updates (only re-runs code reading that path)
setState("user", "name", "Bob");
setState("todos", 0, "done", true);

// Batch with produce (from solid-js/store)
setState(
  produce((s) => {
    s.user.name = "Bob";
    s.todos.push({ id: 2, text: "Done", done: true });
  }),
);
```

Access store values directly (no function call needed):

```tsx
return <div>{state.user.name}</div>; // reactive, no ()
```

---

## Async Data: createResource

```tsx
const [data, { mutate, refetch }] = createResource(
  () => userId(), // reactive source — re-fetches when userId changes
  async (id) => fetch(`/api/user/${id}`).then((r) => r.json()),
);

return (
  <Suspense fallback={<Spinner />}>
    <Show when={data.error} fallback={<Profile user={data()} />}>
      <Error message={data.error.message} />
    </Show>
  </Suspense>
);
```

- `data.loading` — boolean
- `data.error` — error if thrown
- `mutate(val)` — update locally without refetching (optimistic updates)
- `refetch()` — force a new fetch

---

## Context

```tsx
const ThemeContext = createContext<{ dark: Accessor<boolean>; toggle: () => void }>();

export function ThemeProvider(props) {
  const [dark, setDark] = createSignal(false);
  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};
```

---

## Error Handling

```tsx
<ErrorBoundary
  fallback={(err, reset) => (
    <div>
      <p>Something went wrong: {err.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
>
  <RiskyComponent />
</ErrorBoundary>
```

---

## Composable Primitives (Custom Hooks Pattern)

Unlike React hooks, Solid primitives can be called anywhere — no ordering rules. Compose them freely:

```tsx
function useDebounced<T>(signal: Accessor<T>, delay: number): Accessor<T> {
  const [debounced, setDebounced] = createSignal(signal());
  createEffect(() => {
    const t = setTimeout(() => setDebounced(() => signal()), delay);
    return () => clearTimeout(t);
  });
  return debounced;
}
```

---

## Performance Notes

Solid is fast by default. Common over-optimizations to avoid:

- Don't wrap simple expressions in `createMemo`
- Don't use `<For keyed>` — `<For>` already tracks by reference identity
- Don't use `createEffect` when `createMemo` does the job

When you do need to optimize:

- `untrack()` — prevent tracking in hot paths
- `batch()` — batch multiple writes
- `createStore` instead of signal-of-objects — keeps updates fine-grained

---

## Quick Checklist (for reviews)

- [ ] Props accessed via `props.x`, not destructured in function params
- [ ] Signals called as functions (`count()`) inside JSX/effects/memos
- [ ] `<For>` used for lists, not `.map()`
- [ ] `<Show>` for conditionals, not ternary operators with components
- [ ] No `createEffect` used to synchronously derive state (use `createMemo`)
- [ ] `createStore` used for nested/complex state
- [ ] Cleanup returned from effects with subscriptions or timers
- [ ] `splitProps` used when spreading props to DOM elements
