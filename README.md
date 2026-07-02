# Mudae Ranker

The ultimate preference-based Mudae collection ranking and management application.

**🌐 Play Live: [muda-rank.ttlabs.org](https://muda-rank.ttlabs.org)**

Intended for use with the [Mudae bot for Discord](https://discordbots.org/bot/432610292342587392), this application allows you to manage, sort, and rank your character collection through a series of "X vs Y" preference questions. Once you are done sorting, it automatically generates the exact commands you need to copy-paste into Discord to update your collection's sort order.

## 🌟 Key Features

* **Dual-Ranking System:** Choose between Finite Pre-Ranking (standard sorting) or Endless Ranking (Elo-style continuous matchmaking).
* **Cloud Synchronization:** Link your GitHub account to seamlessly save and sync your layout across your desktop and mobile devices.
* **Smart Importing:** Retain your existing Discord sort order while automatically fetching high-quality images.
* **Mass Actions:** Batch insert, mass skip, edit notes, and clear selections with a single click.
* **View Modes:** Toggle between visual Grid mode, compact List mode, or spoiler-free Ghost mode.
* **Local Auto-Save:** Never lose your progress; changes are automatically cached to your browser's local storage the moment you make them.

---

## 📥 Getting Started (The Perfect Import)

To get your collection into the app without losing your current custom sort order, follow these steps exactly:

1. Run **`$mmi-s`** in your Discord server.
2. Copy the entire output from your Discord DMs (excluding the collection title) and paste it into the app's input field.
3. Click **Parse Input**. This imports your characters in your exact current layout, but they will be missing images.
4. Run **`$mmai-s`** in your Discord server. (Mudae forces this command to be alphabetical, but it includes the image URLs).
5. Copy this new output, paste it into the app, and click **Parse Input** again.
6. The application will intelligently merge the two lists—keeping your original custom sort order while attaching all the correct images!

## ⚔️ How to Rank Your Characters

Mudae Ranker offers two distinct ways to organize your collection.

**1. Pre-Rank (Finite)**
Use this mode first! It uses a traditional insertion-sort algorithm. You will be shown a character and asked to compare them against your already-sorted roster until they find their perfect spot. Once the queue is empty, your entire collection is mathematically sorted.

**2. Endless Rank (∞)**
Once your collection is generally sorted, use this mode. Endless Rank continuously pits randomly selected characters against each other, adjusting their hidden Elo rating behind the scenes. This is perfect for fine-tuning your top 100 or simply passing the time.

## ☁️ Cloud Synchronization

You no longer have to rely solely on text file exports to move between your PC and your phone.

Click **Sign in with GitHub** to authorize the application. Mudae Ranker will automatically create a private, hidden Gist on your GitHub profile. Whenever you make changes, the app silently pushes your updated collection to the cloud. When you open the app on another device, it will detect your cloud save and automatically download your latest layout.

## 📦 Managing Your Collection

Clicking on any character thumbnail opens their full card, allowing you to edit their Mudae note, update their image URL, or flag them to be "Skipped" (which throws them to the bottom of your sort and ignores them during ranking).

Use the **Mass Actions** dropdown to apply changes to multiple flagged characters at once:

* **Batch Insert:** Send a group of newly claimed characters to a specific position in your list.
* **Mass Skip / Un-Skip:** Quickly mark trade-fodder characters to be ignored.
* **Mass Link After:** Group specific characters together so they always sort consecutively.
* **Edit Local Notes:** Apply a specific `$note` string to multiple characters simultaneously.

## 📤 Exporting Back to Discord

When your layout is perfect, open the **Exports** dropdown to generate your Discord commands.

* **Export Sort ($smp):** Generates the paginated `$smp` commands. Paste these into Discord to apply your new sort order.
* **Export Notes ($note):** Generates the commands required to update your character notes in Discord.
* **Export JSON:** Generates a complete data backup file of your entire collection state for safe keeping.

---

## 🔍 Fallback Image Lookups (AniList)

If Mudae fails to provide an image URL for a character, the app will attempt to automatically look them up via the [AniList API](https://anilist.co/).

* AniList limits requests to about 75 per minute, which may slightly delay the appearance of missing images.
* AniList sometimes categorizes series or spells character names slightly differently than Mudae (e.g., "Sword Art Online II" vs "Sword Art Online"). If the names do not match, the image fallback will fail.

## 📜 Credits, History & Notes

Project icon created by and used with permission from [@cybernoguchi](https://x.com/cybernoguchi).

This project has evolved across multiple iterations:

* **Original Concept & Base Code:** [jonmervine / DarkMage530](https://github.com/jonmervine/mudae-ranker)
* **Intermediate Updates:** [LieutenantCrunch](https://github.com/LieutenantCrunch/mudae-ranker)
* **Current Version:** [Tech-TTGames](https://github.com/Tech-TTGames/mudae-ranker) — Expanded and modernized with serverless cloud-syncing, Elo-based endless ranking, mass state management, and modern UI/UX workflows.

*Note: Code files are covered by the MIT terms above. The project's branding and graphical design assets are located in the .\Assets directory and are governed by the separate LICENSE file contained within said directory.*
