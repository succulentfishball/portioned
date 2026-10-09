"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight,
  Clock3, Compass, Heart, Leaf, LockKeyhole, MapPin, MessageCircle, MoreHorizontal,
  Plus, Search, Send, ShieldCheck, ShoppingBasket, SlidersHorizontal, Star,
  UserRound, Users, X,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

type Want = { item: string; percent: number; range?: [number, number]; packageSize: string; brand?: string; myPercent?: number; myRange?: [number, number] };
type ShoppingPlan = { items: Want[]; stores: string[]; availability: string };
type Match = {
  id: string; name: string; initials: string; color: string; area: string; distance: string;
  score: number; friend: boolean; verified: boolean; store: string; when: string;
  items: Want[]; bio: string; status: "open" | "requested" | "confirmed";
};

const initialMessages: { from: string; text: string; time: string }[] = [];

function getShareRange(item: Want): [number, number] { return item.range ?? [item.percent, item.percent]; }

function measurePackage(value: string): { dimension: string; baseAmount: number } | null {
  const match = value.trim().toLowerCase().match(/^([0-9]+(?:\.[0-9]+)?)\s*(kg|g|grams?|kilograms?|lb|lbs|pounds?|oz|ounces?|l|liters?|litres?|ml|milliliters?|millilitres?|fl\s?oz|count|ct|each)$/);
  if (!match) return null;
  const amount = Number(match[1]); const unit = match[2].replaceAll(" ", "");
  if (["kg", "kilogram", "kilograms"].includes(unit)) return { dimension: "mass", baseAmount: amount * 1000 };
  if (["g", "gram", "grams"].includes(unit)) return { dimension: "mass", baseAmount: amount };
  if (["lb", "lbs", "pound", "pounds"].includes(unit)) return { dimension: "mass", baseAmount: amount * 453.592 };
  if (["oz", "ounce", "ounces"].includes(unit)) return { dimension: "mass", baseAmount: amount * 28.3495 };
  if (["l", "liter", "liters", "litre", "litres"].includes(unit)) return { dimension: "volume", baseAmount: amount * 1000 };
  if (["ml", "milliliter", "milliliters", "millilitre", "millilitres"].includes(unit)) return { dimension: "volume", baseAmount: amount };
  if (unit === "floz") return { dimension: "volume", baseAmount: amount * 29.5735 };
  return { dimension: "count", baseAmount: amount };
}

function portionsFitAtPackageSize(ours: Want, theirs: Want): boolean {
  const [ourMin, ourMax] = getShareRange(ours); const [theirMin, theirMax] = getShareRange(theirs);
  const ourPack = measurePackage(ours.packageSize); const theirPack = measurePackage(theirs.packageSize);
  if (ourPack && theirPack && ourPack.dimension === theirPack.dimension) {
    const totalMin = ourPack.baseAmount * ourMin / 100 + theirPack.baseAmount * theirMin / 100;
    const totalMax = ourPack.baseAmount * ourMax / 100 + theirPack.baseAmount * theirMax / 100;
    return [ourPack.baseAmount, theirPack.baseAmount].some((packSize) => totalMin <= packSize * 1.25 && totalMax >= packSize * 0.75);
  }
  const combinedMin = ourMin + theirMin; const combinedMax = ourMax + theirMax;
  return combinedMin <= 125 && combinedMax >= 75;
}

function comparePlanToMatch(plan: ShoppingPlan, match: Match): { score: number; items: Want[] } | null {
  const commonItems = plan.items.flatMap((wanted) => {
    const partnerItem = match.items.find((item) => item.item.toLowerCase() === wanted.item.toLowerCase());
    if (!partnerItem) return [];
    if (wanted.brand && partnerItem.brand && wanted.brand.toLowerCase() !== partnerItem.brand.toLowerCase()) return [];
    if (!portionsFitAtPackageSize(wanted, partnerItem)) return [];
    return [{ ...partnerItem, myPercent: wanted.percent, myRange: getShareRange(wanted) }];
  });
  const sharedStore = plan.stores.includes(match.store);
  const wantedTime = plan.availability.replace(/\s+/g, " ").trim().toLowerCase();
  const partnerTime = match.when.replace(/\s+/g, " ").trim().toLowerCase();
  const sharedTime = wantedTime.startsWith("flexible") || partnerTime.startsWith("flexible") || wantedTime === partnerTime;
  if (!commonItems.length || !sharedStore || !sharedTime) return null;
  const score = Math.min(99, 68 + Math.min(commonItems.length, 2) * 12 + (sharedStore ? 10 : 0) + (sharedTime ? 7 : 0));
  return { score, items: commonItems };
}

function Avatar({ initials, color, size = "normal" }: { initials: string; color: string; size?: "normal" | "small" | "large" }) {
  return <div className={`avatar avatar-${color} avatar-${size}`}>{initials}</div>;
}

function Logo() {
  return <div className="brand"><span className="brand-mark"><Leaf size={19} strokeWidth={2.5} /></span><span>portioned</span></div>;
}

export default function Home() {
  const [tab, setTab] = useState<"friends" | "public">("friends");
  const [nav, setNav] = useState("Discover");
  const [query, setQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("All stores");
  const [matches, setMatches] = useState<Match[]>([]);
  const [myPlans, setMyPlans] = useState<ShoppingPlan[]>([]);
  const [modal, setModal] = useState<"create" | "chat" | "review" | "profile" | "safety" | "report" | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [profileTarget, setProfileTarget] = useState<Match | null>(null);
  const [toast, setToast] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [messageDraft, setMessageDraft] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [session, setSession] = useState<{ user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [catalogStores, setCatalogStores] = useState<{ id: string; label: string; chain: string; location_label: string }[]>([]);
  const [catalogTypes, setCatalogTypes] = useState<{ id: string; name: string; category: string }[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [currentProfile, setCurrentProfile] = useState<{ display_name: string; area_label: string; avatar_color: string } | null>(null);
  const [pilotAreaId, setPilotAreaId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, current) => {
      if (mounted) setSession(current ? { user: current.user } : null);
    });
    const fallback = window.setTimeout(() => { if (mounted) setAuthReady(true); }, 3000);
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      setSession(data.session ? { user: data.session.user } : null);
    }).catch((error: unknown) => {
      if (mounted) setAuthError(error instanceof Error ? error.message : "Could not restore your sign-in session.");
    }).finally(() => {
      if (mounted) { window.clearTimeout(fallback); setAuthReady(true); }
    });
    return () => { mounted = false; window.clearTimeout(fallback); subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    let mounted = true;
    void Promise.all([
      supabase.from("stores").select("id, chain, location_label").eq("active", true).order("chain"),
      supabase.from("item_categories").select("id, name, sort_order").eq("active", true).order("sort_order"),
      supabase.from("item_types").select("id, name, category_id").eq("active", true).order("name"),
    ]).then(([storeResult, categoryResult, typeResult]) => {
      if (!mounted) return;
      if (storeResult.data) setCatalogStores(storeResult.data.map((row) => ({ ...row, label: `${row.chain} · ${row.location_label}` })));
      if (categoryResult.data && typeResult.data) {
        const categoryNames = new Map(categoryResult.data.map((category) => [category.id, category.name]));
        const itemTypes = typeResult.data.map((item) => ({ id: item.id, name: item.name, category: categoryNames.get(item.category_id) ?? "" }));
        setCatalogTypes(itemTypes);
        setCatalogError(itemTypes.length ? "" : "The item catalog is empty. Run `npx supabase db push` to load the seed data.");
      } else {
        setCatalogError(typeResult.error?.message ?? categoryResult.error?.message ?? "Could not load the item catalog.");
      }
    }).catch((error: unknown) => {
      if (mounted) setCatalogError(error instanceof Error ? error.message : "Could not load the item catalog.");
    });
    return () => { mounted = false; };
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) return;
    let mounted = true;
    void Promise.all([
      supabase.from("profiles").select("display_name, area_label, avatar_color").eq("id", session.user.id).maybeSingle(),
      supabase.from("pilot_areas").select("id").eq("slug", "roosevelt-island-midtown-east").maybeSingle(),
      supabase.from("shopping_plans").select("id, owner_id, availability_label, profiles!shopping_plans_owner_id_fkey(display_name, area_label, bio, avatar_color), plan_items(desired_share_min, desired_share_max, brand_preference, estimated_package_size, package_size_unit, item_types(name)), plan_stores(stores(id, chain, location_label))").eq("status", "active").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
      supabase.from("friend_requests").select("sender_id, recipient_id").eq("status", "accepted"),
    ]).then(([profileResult, areaResult, plansResult, friendsResult]) => {
      if (!mounted) return;
      if (profileResult.data) setCurrentProfile(profileResult.data);
      if (areaResult.data) setPilotAreaId(areaResult.data.id);
      if (plansResult.data) {
        type PlanRow = { id: string; owner_id: string; availability_label: string; profiles: { display_name: string; area_label: string; bio: string; avatar_color: string } | null; plan_items: { desired_share_min: number; desired_share_max: number; brand_preference: string | null; estimated_package_size: number | null; package_size_unit: string | null; item_types: { name: string } | null }[]; plan_stores: { stores: { id: string; chain: string; location_label: string } | null }[] };
        const rows = plansResult.data as unknown as PlanRow[];
        const ownRows = rows.filter((row) => row.owner_id === session.user.id);
        setMyPlans(ownRows.map((plan) => ({ availability: plan.availability_label, items: plan.plan_items.map((item) => ({ item: item.item_types?.name ?? "Item", percent: Math.round((item.desired_share_min + item.desired_share_max) * 50), range: [Math.round(item.desired_share_min * 100), Math.round(item.desired_share_max * 100)], packageSize: item.estimated_package_size ? `${item.estimated_package_size} ${item.package_size_unit ?? ""}`.trim() : "", brand: item.brand_preference ?? "" })), stores: plan.plan_stores.flatMap((entry) => entry.stores ? [`${entry.stores.chain} · ${entry.stores.location_label}`] : []) })));
        const ownPlans = ownRows.map((plan) => ({ items: plan.plan_items.map((item) => ({ item: item.item_types?.name ?? "Item", percent: Math.round((item.desired_share_min + item.desired_share_max) * 50), range: [Math.round(item.desired_share_min * 100), Math.round(item.desired_share_max * 100)] as [number, number], packageSize: item.estimated_package_size ? `${item.estimated_package_size} ${item.package_size_unit ?? ""}`.trim() : "", brand: item.brand_preference ?? "" })), stores: plan.plan_stores.flatMap((entry) => entry.stores ? [`${entry.stores.chain} · ${entry.stores.location_label}`] : []), availability: plan.availability_label }));
        const friendIds = new Set((friendsResult.data ?? []).map((row) => row.sender_id === session.user.id ? row.recipient_id : row.recipient_id === session.user.id ? row.sender_id : ""));
        const compatible = rows.filter((row) => row.owner_id !== session.user.id && Boolean(row.profiles));
        const nextMatches: Match[] = [];
        for (const row of compatible) {
          const profile = row.profiles!;
          const candidate: Match = { id: row.owner_id, name: profile.display_name, initials: profile.display_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase(), color: profile.avatar_color, area: profile.area_label, distance: "In pilot area", score: 80, friend: friendIds.has(row.owner_id), verified: false, store: "", when: row.availability_label, items: row.plan_items.map((item) => ({ item: item.item_types?.name ?? "", percent: Math.round((item.desired_share_min + item.desired_share_max) * 50), range: [Math.round(item.desired_share_min * 100), Math.round(item.desired_share_max * 100)], packageSize: item.estimated_package_size ? `${item.estimated_package_size} ${item.package_size_unit ?? ""}`.trim() : "", brand: item.brand_preference ?? "" })), bio: profile.bio, status: "open" };
          let best: { score: number; items: Want[]; store: string } | null = null;
          for (const own of ownPlans) for (const store of row.plan_stores.flatMap((entry) => entry.stores ? [`${entry.stores.chain} · ${entry.stores.location_label}`] : [])) {
            if (!own.stores.includes(store)) continue;
            const result = comparePlanToMatch(own, { ...candidate, store });
            if (result && (!best || result.score > best.score)) best = { ...result, store };
          }
          if (best) nextMatches.push({ ...candidate, ...best });
        }
        setMatches(nextMatches.filter((match, index, all) => all.findIndex((other) => other.id === match.id) === index));
      }
    });
    return () => { mounted = false; };
  }, [session]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activePlanMatches = useMemo(() => myPlans[0] ? matches.flatMap((match) => {
    const compatible = comparePlanToMatch(myPlans[0], match);
    return compatible ? [{ ...match, score: compatible.score, items: compatible.items }] : [];
  }) : matches, [matches, myPlans]);

  const visibleMatches = useMemo(() => activePlanMatches
    .filter((match) => tab === "public" || match.friend)
    .filter((match) => storeFilter === "All stores" || match.store.startsWith(storeFilter))
    .filter((match) => !query || `${match.name} ${match.area} ${match.store} ${match.items.map((item) => item.item).join(" ")}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.score - a.score), [activePlanMatches, tab, storeFilter, query]);

  const notify = (message: string) => setToast(message);
  const updateMatch = (id: string, status: Match["status"]) => {
    setMatches((current) => current.map((match) => match.id === id ? { ...match, status } : match));
    if (status === "requested") notify(`Request sent to ${matches.find((match) => match.id === id)?.name ?? "shopper"}`);
  };

  const openChat = (match: Match) => {
    setSelectedMatch(match);
    setModal("chat");
  };

  const savePlan = async (items: Want[], chosenStores: string[], availability: string) => {
    if (!supabase || !session || !pilotAreaId) { notify("The pilot catalog is still loading. Try again in a moment."); return; }
    const storeIds = chosenStores.map((label) => catalogStores.find((store) => store.label === label)?.id).filter((id): id is string => Boolean(id));
    const itemRows = items.map((item) => {
      const size = item.packageSize.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);
      return { item_type_id: catalogTypes.find((type) => type.name === item.item)?.id, desired_share_min: Math.min(...getShareRange(item)) / 100, desired_share_max: Math.max(...getShareRange(item)) / 100, estimated_package_size: size ? Number(size[1]) : null, package_size_unit: size?.[2]?.trim() || null, brand_preference: item.brand || null };
    });
    if (storeIds.length !== chosenStores.length || itemRows.some((item) => !item.item_type_id)) { notify("A selected store or item type is no longer in the catalog. Refresh and try again."); return; }
    const { data: plan, error } = await supabase.from("shopping_plans").insert({ owner_id: session.user.id, pilot_area_id: pilotAreaId, availability_label: availability }).select("id").single();
    if (error || !plan) { notify(error?.message ?? "Could not save your list."); return; }
    const [itemInsert, storeInsert] = await Promise.all([
      supabase.from("plan_items").insert(itemRows.map((item) => ({ ...item, plan_id: plan.id }))),
      supabase.from("plan_stores").insert(storeIds.map((store_id) => ({ plan_id: plan.id, store_id }))),
    ]);
    if (itemInsert.error || storeInsert.error) { await supabase.from("shopping_plans").delete().eq("id", plan.id); notify(itemInsert.error?.message ?? storeInsert.error?.message ?? "Could not save list details."); return; }
    notify("Your list was saved to the pilot database."); window.location.reload();
  };

  const navItems = [
    { name: "Discover", icon: Compass }, { name: "My lists", icon: ShoppingBasket },
  ];

  const changeNav = (name: string) => {
    setNav(name);
    if (name === "My lists") setModal(null);
    else setModal(null);
  };

  if (!hasSupabaseConfig) return <ConnectionGate />;
  if (!authReady) return <ConnectionGate message="Connecting to Portion­ed…" />;
  if (!session) return <SignInScreen email={authEmail} name={authName} message={authMessage || authError} setEmail={setAuthEmail} setName={setAuthName} onSubmit={async (event) => {
    event.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOtp({ email: authEmail, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin, data: { display_name: authName.trim() || authEmail.split("@")[0] } } });
    setAuthMessage(error ? error.message : "Check your email for a sign-in link. New accounts are created automatically.");
  }} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="pilot-label"><span className="pilot-dot" /> PILOT AREA</div>
        <div className="area-picker"><MapPin size={15} /><span>{currentProfile?.area_label ?? "Roosevelt Island + Midtown East"}</span><ChevronDown size={14} /></div>
        <div className="side-label">MENU</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${nav === name ? "active" : ""}`} onClick={() => changeNav(name)}><Icon size={19} /><span>{name}</span></button>)}
        </nav>
        <div className="sidebar-spacer" />
        <button className="profile-row" onClick={() => { setProfileTarget(null); setModal("profile"); }}><Avatar initials={(currentProfile?.display_name ?? session.user.email ?? "U").slice(0, 2).toUpperCase()} color={currentProfile?.avatar_color ?? "sage"} size="small" /><span className="profile-copy"><strong>{currentProfile?.display_name ?? session.user.email}</strong><small>{currentProfile?.area_label ?? "Pilot area"}</small></span><MoreHorizontal size={19} /></button>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>Home</span><ChevronRight size={14} /><strong>{nav}</strong></div>
          <div className="top-actions"><div className="pilot-chip"><span className="pilot-dot" /> {currentProfile?.area_label ?? "Pilot area"}</div><button className="text-button" onClick={() => { void supabase?.auth.signOut(); }}>Sign out</button></div>
        </header>

        {nav === "My lists" ? <MyLists plans={myPlans} onCreate={() => setModal("create")} /> : (
          <>
            <section className="welcome-row">
              <div><div className="eyebrow">ROOSEVELT ISLAND + MIDTOWN EAST</div><h1>Find a shopping <em>partner.</em></h1><p className="welcome-copy">Shop together. Split what you buy.</p></div>
              <button className="button button-primary create-button" onClick={() => setModal("create")}><Plus size={18} /> Create a shopping list</button>
            </section>

            <section className="section-head">
              <div><h2>Shoppers <span className="result-count">{visibleMatches.length}</span></h2></div>
            </section>

            <div className="discovery-controls">
              <div className="tabs" role="tablist" aria-label="Shopper audience"><button className={tab === "friends" ? "selected" : ""} onClick={() => setTab("friends")} role="tab" aria-selected={tab === "friends"}><Users size={16} /> Friends <span>{matches.filter((match) => match.friend).length}</span></button><button className={tab === "public" ? "selected" : ""} onClick={() => setTab("public")} role="tab" aria-selected={tab === "public"}><Compass size={16} /> Public <span>{matches.length}</span></button></div>
              <div className="filters"><label className="search-box"><Search size={16} /><input aria-label="Search shoppers and items" placeholder="Search shoppers or items" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="store-filter"><SlidersHorizontal size={15} /><select aria-label="Filter by store" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}><option>All stores</option>{catalogStores.map((store) => <option key={store.id}>{store.chain}</option>)}</select><ChevronDown size={14} /></label></div>
            </div>

            <div className="match-list">
              {visibleMatches.slice(0, showAll ? undefined : 3).map((match) => <MatchCard key={match.id} match={match} onRequest={() => { if (match.status === "open") updateMatch(match.id, "requested"); else if (match.status === "requested") notify("Your request is waiting for their reply."); }} onChat={() => openChat(match)} onProfile={() => { setSelectedMatch(match); setProfileTarget(match); setModal("profile"); }} />)}
              {visibleMatches.length === 0 && <div className="empty-state"><div className="empty-illustration"><Search size={25} /></div><h3>No shoppers found</h3><p>Create a list or adjust your filters.</p>{(query || storeFilter !== "All stores") && <button className="button button-outline" onClick={() => { setStoreFilter("All stores"); setQuery(""); }}>Clear filters</button>}</div>}
            </div>
            {visibleMatches.length > 3 && <button className="load-more" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer matches" : "See all compatible shoppers"}<ArrowRight size={16} /></button>}
          </>
        )}
      </section>

      {modal === "create" && <CreateModal stores={catalogStores.map((store) => store.label)} itemTypes={catalogTypes} catalogError={catalogError} onClose={() => setModal(null)} onSave={savePlan} />}
      {modal === "chat" && selectedMatch && <ChatModal match={selectedMatch} messages={messages} draft={messageDraft} setDraft={setMessageDraft} onSend={() => { if (!messageDraft.trim()) return; setMessages((current) => [...current, { from: "me", text: messageDraft.trim(), time: "now" }]); setMessageDraft(""); }} onClose={() => setModal(null)} onComplete={() => setModal("review")} />}
      {modal === "review" && selectedMatch && <ReviewModal match={selectedMatch} onClose={() => setModal(null)} onSubmit={(rating) => { setModal(null); notify(`Thanks for sharing your ${rating}-star review`); }} />}
      {modal === "profile" && <ProfileModal match={profileTarget} selfName={currentProfile?.display_name ?? session.user.email ?? "Your profile"} selfArea={currentProfile?.area_label ?? "Pilot area"} onClose={() => setModal(null)} onEdit={() => notify("Profile editing is not available in this pilot build.")} onFriend={() => { notify(`${profileTarget?.name ?? "Friend"} friend request sent`); setModal(null); }} onReport={() => setModal("report")} />}
      {modal === "report" && (profileTarget || selectedMatch) && <ReportModal match={profileTarget ?? selectedMatch!} onClose={() => setModal(null)} onSubmit={() => { setModal(null); notify("Report submitted. Thanks for letting us know."); }} onBlock={() => { const blockedId = profileTarget?.id ?? selectedMatch!.id; setMatches((current) => current.filter((match) => match.id !== blockedId)); setModal(null); notify("This shopper is now blocked and hidden from your matches."); }} />}
      {modal === "safety" && <SafetyModal onClose={() => setModal(null)} />}
      {toast && <div className="toast"><CheckCircle2 size={18} /> {toast}</div>}
    </main>
  );
}

function MatchCard({ match, onRequest, onChat, onProfile }: { match: Match; onRequest: () => void; onChat: () => void; onProfile: () => void }) {
  return <article className="match-card">
    <div className="match-person"><button className="person-button" onClick={onProfile}><Avatar initials={match.initials} color={match.color} size="large" /></button><div className="person-details"><div className="name-row"><button onClick={onProfile} className="person-name">{match.name}</button>{match.friend && <span className="friend-badge"><Heart size={11} fill="currentColor" /> FRIEND</span>}</div><div className="person-meta">{match.area}</div>{match.bio && <p>{match.bio}</p>}</div></div>
    <div className="match-details">
      <div className="match-detail-block"><span className="detail-label"><ShoppingBasket size={14} /> SHARED LIST</span><div className="shared-items">{match.items.map((item) => { const [yourMin, yourMax] = item.myRange ?? [item.myPercent ?? 50, item.myPercent ?? 50]; const yourShare = yourMin === yourMax ? `${yourMin}%` : `${yourMin}–${yourMax}%`; return <div className="shared-item" key={item.item}><span className="item-name"><span className="item-spark">✳</span>{item.item}</span><span className="item-share">You {yourShare} <i>+</i> them {item.percent}%</span></div>; })}</div></div>
      <div className="match-detail-block match-logistics"><span className="detail-label"><MapPin size={14} /> STORE</span><strong>{match.store}</strong><span className="detail-label time-label"><Clock3 size={14} /> TIME</span><strong>{match.when}</strong></div>
    </div>
    <div className="match-card-footer"><div className="card-actions"><button className="button button-outline small-action" onClick={onChat}><MessageCircle size={15} /> Message</button><button className="button button-primary" onClick={onRequest}>{match.status === "requested" ? "Requested" : "Plan this split"}<ArrowRight size={15} /></button></div></div>
  </article>;
}

function CreateModal({ onClose, onSave, stores, itemTypes, catalogError }: { onClose: () => void; onSave: (items: Want[], stores: string[], availability: string) => void; stores: string[]; itemTypes: { name: string; category: string }[]; catalogError: string }) {
  const [items, setItems] = useState<Want[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [availability, setAvailability] = useState("Saturday · 11 am–2 pm");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState(false);
  const [error, setError] = useState("");
  const filteredTypes = itemTypes.filter((type) => type.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6);
  const addItem = (name: string) => { if (!items.some((item) => item.item === name)) setItems((current) => [...current, { item: name, percent: 50, range: [50, 50], packageSize: "", brand: "" }]); setSearch(""); setSuggestions(false); };
  const toggleStore = (store: string) => setSelectedStores((current) => current.includes(store) ? current.filter((entry) => entry !== store) : [...current, store]);
  const submit = () => { if (!items.length) { setError("Add at least one item to your list."); return; } if (!selectedStores.length) { setError("Choose at least one store."); return; } onSave(items, selectedStores, availability); };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="modal-topline"><div className="modal-icon green-icon"><ShoppingBasket size={19} /></div><button className="icon-button close-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><div className="modal-heading"><h2 id="create-title">Create a shopping list</h2><p>Add items, a store, and a time.</p></div>
    <div className="form-section"><label className="form-label">YOUR SHOPPING LIST</label><div className="item-editor-list">{items.map((item, index) => { const rangeValue = item.range ? `${item.range[0]}-${item.range[1]}` : `${item.percent}-${item.percent}`; return <div className="item-editor" key={`${item.item}-${index}`}><div className="editor-item-title"><span className="item-spark">✳</span><strong>{item.item}</strong><button aria-label={`Remove ${item.item}`} onClick={() => setItems((current) => current.filter((_, i) => i !== index))}><X size={15} /></button></div><div className="editor-fields"><label><span>YOUR SHARE</span><select value={rangeValue} onChange={(event) => { const [min, max] = event.target.value.split("-").map(Number); setItems((current) => current.map((entry, i) => i === index ? { ...entry, percent: Math.round((min + max) / 2), range: [min, max] } : entry)); }}><option value="25-25">About 25%</option><option value="33-33">About ⅓</option><option value="40-60">40–60% range</option><option value="50-50">About 50%</option><option value="60-60">About 60%</option><option value="67-67">About ⅔</option><option value="75-75">About 75%</option></select></label><label><span>PACK SIZE <small>optional estimate</small></span><input placeholder="e.g. 1 lb or 500 g" value={item.packageSize} onChange={(event) => setItems((current) => current.map((entry, i) => i === index ? { ...entry, packageSize: event.target.value } : entry))} /></label><label className="brand-field"><span>BRAND PREFERENCE <small>optional</small></span><input placeholder="Any brand is fine" value={item.brand ?? ""} onChange={(event) => setItems((current) => current.map((entry, i) => i === index ? { ...entry, brand: event.target.value } : entry))} /></label></div></div>; })}</div>
    <div className="type-search"><Search size={16} /><input placeholder="Add an item" value={search} onChange={(event) => { setSearch(event.target.value); setSuggestions(true); }} onFocus={() => setSuggestions(true)} onKeyDown={(event) => { if (event.key === "Enter" && filteredTypes[0]) { event.preventDefault(); addItem(filteredTypes[0].name); } }} /><button className="add-item-button" onClick={() => setSuggestions(!suggestions)}><Plus size={15} /> Add</button>{suggestions && search && <div className="suggestion-menu">{filteredTypes.length ? filteredTypes.map((type) => <button key={type.name} onClick={() => addItem(type.name)}><span>{type.name}</span><small>{type.category}</small></button>) : <div className="catalog-empty">No item found.</div>}</div>}</div>{catalogError && <p className="form-error">{catalogError}</p>}
    </div>
    <div className="form-section store-section"><label className="form-label">STORE</label><div className="store-options">{stores.map((store, index) => <button key={store} className={`store-option ${selectedStores.includes(store) ? "chosen" : ""}`} onClick={() => toggleStore(store)}><span className="store-checkbox">{selectedStores.includes(store) && <Check size={13} />}</span><span className="store-option-main"><strong>{store.split(" · ")[0]}</strong><small>{store.split(" · ")[1]}</small></span><span className={`store-monogram store-${index}`}>{store.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span></button>)}</div></div>
    <div className="form-section availability-section"><label className="form-label">WHEN ARE YOU FREE?</label><div className="availability-select"><CalendarDays size={16} /><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option>Saturday · 11 am–2 pm</option><option>Saturday · 2–5 pm</option><option>Sunday · 10 am–1 pm</option><option>Weekday evenings · 5–7 pm</option><option>Flexible — let’s coordinate</option></select><ChevronDown size={14} /></div></div>
    {error && <p className="form-error">{error}</p>}
    <div className="modal-footer"><button className="text-button" onClick={onClose}>Cancel</button><button className="button button-primary" onClick={submit}>Save list <ArrowRight size={16} /></button></div>
  </section></div>;
}

function ChatModal({ match, messages, draft, setDraft, onSend, onClose, onComplete }: { match: Match; messages: typeof initialMessages; draft: string; setDraft: (value: string) => void; onSend: () => void; onClose: () => void; onComplete: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal chat-modal" role="dialog" aria-modal="true" aria-label={`Chat with ${match.name}`}><header className="chat-header"><div className="chat-profile"><Avatar initials={match.initials} color={match.color} /><div><strong>{match.name}</strong><span><i className="online-dot" /> Your shopping chat</span></div></div><div className="chat-head-actions"><button className="text-button chat-complete" onClick={onComplete}>Trip complete <CheckCircle2 size={15} /></button><button className="icon-button" onClick={onClose} aria-label="Close chat"><X size={19} /></button></div></header><div className="chat-context"><span><MapPin size={14} /> {match.store}</span><span><CalendarDays size={14} /> {match.when}</span></div><div className="chat-safety"><LockKeyhole size={13} /> Messages are only visible to you and {match.name.split(" ")[0]}.</div><div className="messages-scroll"><div className="chat-day">TODAY</div>{messages.map((message, index) => <div key={`${message.time}-${index}`} className={`message-row ${message.from === "me" ? "mine" : "theirs"}`}>{message.from !== "me" && <Avatar initials={match.initials} color={match.color} size="small" />}<div className="message-body"><div className="message-bubble">{message.text}</div><small>{message.time}</small></div></div>)}</div><form className="chat-input-row" onSubmit={(event) => { event.preventDefault(); onSend(); }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" aria-label="Write a message"/><button className="send-button" type="submit" aria-label="Send message"><Send size={17} /></button></form><div className="chat-footnote"><ShieldCheck size={14} /> Keep your plans in app and meet inside the store.</div></section></div>;
}

function ReviewModal({ match, onClose, onSubmit }: { match: Match; onClose: () => void; onSubmit: (rating: number) => void }) {
  const [rating, setRating] = useState(0); const [hover, setHover] = useState(0); const [note, setNote] = useState("");
  return <div className="modal-backdrop"><section className="modal review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="modal-topline"><div className="modal-icon gold-icon"><Star size={19} /></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><div className="modal-heading"><div className="eyebrow">TRIP COMPLETE</div><h2 id="review-title">How was your shop with {match.name.split(" ")[0]}?</h2><p>Your feedback helps make Portion­ed a more thoughtful place to share.</p></div><div className="rating-stars" onMouseLeave={() => setHover(0)}>{[1, 2, 3, 4, 5].map((number) => <button key={number} aria-label={`${number} stars`} onMouseEnter={() => setHover(number)} onClick={() => setRating(number)}><Star size={34} fill={(hover || rating) >= number ? "currentColor" : "none"} /></button>)}</div><div className="rating-tags"><span>On time</span><span>Communicative</span><span>Easy to split with</span></div><label className="review-note"><span>Anything else to share? <small>optional</small></span><textarea rows={3} placeholder="A kind word goes a long way…" value={note} onChange={(event) => setNote(event.target.value)} /></label><div className="modal-footer"><button className="text-button" onClick={onClose}>Skip for now</button><button className="button button-primary" disabled={!rating} onClick={() => onSubmit(rating)}>Submit review <ArrowRight size={16} /></button></div></section></div>;
}

function ProfileModal({ match: target, selfName, selfArea, onClose, onEdit, onFriend, onReport }: { match: Match | null; selfName: string; selfArea: string; onClose: () => void; onEdit: () => void; onFriend: () => void; onReport: () => void }) {
  const isSelf = !target;
  const name = target?.name ?? selfName;
  const area = target?.area ?? selfArea;
  const color = target?.color ?? "sage";
  const initials = target?.initials ?? selfName.slice(0, 2).toUpperCase();
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal profile-modal" role="dialog" aria-modal="true" aria-label={`${name} profile`}><button className="icon-button profile-close" onClick={onClose} aria-label="Close"><X size={19} /></button><div className={`profile-cover cover-${color}`}><div className="cover-shape shape-a"/><div className="cover-shape shape-b"/></div><div className="profile-body"><Avatar initials={initials} color={color} size="large"/><div className="profile-name-line"><h2>{name}</h2>{target?.verified && <span className="verified-mark"><Check size={11} /></span>}</div><p className="profile-loc"><MapPin size={14}/>{area}{target && <> <span>·</span> {target.distance}</>}</p>{target?.bio && <p className="profile-bio">{target.bio}</p>}{target && <><div className="profile-section-label">LOOKING TO SHARE</div><div className="profile-item-list">{target.items.map((item) => <div key={item.item}><span><span className="item-spark">✳</span>{item.item}</span><strong>~{item.percent}%</strong></div>)}</div><div className="profile-section-label">PREFERRED STORE & TIME</div><div className="profile-preference"><span><MapPin size={14}/>{target.store}</span><span><Clock3 size={14}/>{target.when}</span></div></>}<div className="profile-actions">{isSelf ? <button className="button button-outline" onClick={onEdit}><UserRound size={15}/> Edit profile</button> : <button className="button button-outline" onClick={onClose}><MessageCircle size={15}/> Message</button>}{!isSelf && <button className="button button-primary" onClick={onFriend}><UserRound size={15}/> Add friend</button>}</div>{!isSelf && <button className="profile-report" onClick={onReport}>Report or block this person</button>}</div></section></div>;
}

function ReportModal({ match, onClose, onSubmit, onBlock }: { match: Match; onClose: () => void; onSubmit: () => void; onBlock: () => void }) {
  const [reason, setReason] = useState("Made me feel unsafe");
  const [details, setDetails] = useState("");
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title"><div className="modal-topline"><div className="modal-icon gold-icon"><ShieldCheck size={19}/></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></div><div className="modal-heading"><div className="eyebrow">SAFETY SUPPORT</div><h2 id="report-title">Report {match.name}</h2><p>Tell us what happened. Reports are private and go to the Portion­ed team.</p></div><label className="report-reason"><span>WHAT’S THE CONCERN?</span><select value={reason} onChange={(event) => setReason(event.target.value)}><option>Made me feel unsafe</option><option>Harassment or inappropriate messages</option><option>Did not show up to the shop</option><option>Misrepresented their plans</option><option>Something else</option></select></label><label className="review-note"><span>MORE DETAILS <small>optional</small></span><textarea rows={4} maxLength={1500} placeholder="Share details that may help us review this…" value={details} onChange={(event) => setDetails(event.target.value)}/></label><div className="report-block"><span>Don’t want to see this shopper again?</span><button onClick={onBlock}>Block {match.name.split(" ")[0]}</button></div><div className="modal-footer"><button className="text-button" onClick={onClose}>Cancel</button><button className="button button-primary" onClick={onSubmit}>Submit report <ArrowRight size={15}/></button></div></section></div>;
}

function SafetyModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal safety-modal" role="dialog" aria-modal="true" aria-labelledby="safety-title"><div className="modal-topline"><div className="modal-icon green-icon"><ShieldCheck size={19} /></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><div className="modal-heading"><div className="eyebrow">SHARING SHOULD FEEL GOOD</div><h2 id="safety-title">A few good habits</h2><p>Small steps can help everyone feel comfortable meeting up.</p></div><div className="safety-list"><div><span><MessageCircle size={17}/></span><section><strong>Keep the conversation in app</strong><p>Agree on the store, time, and details in your private chat.</p></section></div><div><span><MapPin size={17}/></span><section><strong>Meet inside the store</strong><p>Choose a public, familiar place and arrive around the same time.</p></section></div><div><span><ShoppingBasket size={17}/></span><section><strong>Check the package together</strong><p>Confirm the product and size before buying, then agree on the split.</p></section></div><div><span><ShieldCheck size={17}/></span><section><strong>Use block and report if needed</strong><p>Tell Portion­ed about a concern and we’ll review it.</p></section></div></div><div className="modal-footer"><span className="safety-footnote"><LockKeyhole size={14}/> Your home address is never shown.</span><button className="button button-primary" onClick={onClose}>Got it <Check size={16}/></button></div></section></div>;
}

function MyLists({ plans, onCreate }: { plans: ShoppingPlan[]; onCreate: () => void }) {
  return <div className="my-lists-page"><section className="welcome-row"><div><h1>My lists</h1></div><button className="button button-primary create-button" onClick={onCreate}><Plus size={18}/> Create list</button></section>{plans.length === 0 ? <div className="empty-state list-empty"><h3>No lists yet</h3><button className="button button-primary" onClick={onCreate}><Plus size={16}/> Create list</button></div> : <div className="my-plan-grid">{plans.map((plan, index) => <article className="my-plan-card" key={index}><div className="plan-card-top"><div className="modal-icon green-icon"><ShoppingBasket size={18}/></div><span className="live-label"><i/> ACTIVE</span></div><h3>List {plans.length - index}</h3><p>{plan.stores.length} stores · {plan.availability}</p><div className="my-plan-items">{plan.items.map((item) => <span key={item.item}><span className="item-spark">✳</span>{item.item}<b>{item.range && item.range[0] !== item.range[1] ? `${item.range[0]}–${item.range[1]}%` : `~${item.percent}%`}</b></span>)}</div><button className="text-button" onClick={onCreate}>Create another list <ArrowRight size={15}/></button></article>)}</div>}</div>;
}

function ConnectionGate({ message = "Connect Portion­ed to Supabase to load the pilot catalog and account data." }: { message?: string }) {
  return <main className="auth-shell"><section className="auth-card"><Logo /><div className="modal-icon green-icon"><Leaf size={19} /></div><div className="eyebrow">PORTION­ED SETUP</div><h1>One good share starts here.</h1><p>{message}</p><p>Follow <strong>SETUP.md</strong> to configure the Supabase project and local environment.</p></section></main>;
}

function SignInScreen({ email, name, message, setEmail, setName, onSubmit }: { email: string; name: string; message: string; setEmail: (value: string) => void; setName: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <main className="auth-shell"><form className="auth-card" onSubmit={onSubmit}><Logo /><div className="modal-icon green-icon"><Leaf size={19} /></div><div className="eyebrow">ROOSEVELT ISLAND + MIDTOWN EAST</div><h1>Sign in</h1><p>Enter your name and email to continue.</p><label>Your name<input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><button className="button button-primary" type="submit">Send sign-in link <ArrowRight size={16} /></button>{message && <p className="auth-message">{message}</p>}</form></main>;
}
