# n8n-nodes-Maileon

Custom n8n node for interacting with **Maileon**, enabling seamless automation with your workflows.

[![npm](https://img.shields.io/npm/v/n8n-nodes-maileon)](https://www.npmjs.com/package/n8n-nodes-maileon)

---

## 📦 Installation

### Self-hosted or Desktop n8n

Install the node in your n8n instance directory:

```bash
npm install n8n-nodes-maileon
```

Then restart n8n:

```bash
n8n stop && n8n start
```

> ✅ Ensure **Community Nodes** are enabled in **Settings → Community Nodes** inside the n8n editor.

---

## 🔐 Authentication

This node supports **API Key authentication**.

To configure:

1. Open the node in the n8n editor
2. Under **Credentials**, select or create the credential you want the node to use

---

## 🔧 Features

- Create or update contacts in Maileon
- Create contact events in Maileon
- Send unsubscribe requests to Maileon using email address or external_id
- Fetch unsubscriptions via Maileon webhook
- Fetch double opt-ins via Maileon webhook
- Compatible with n8n’s data structure
- Works with expressions and dynamic values

---

## 🧱 Usage

1. Drag the node into your workflow
2. Choose an operation
3. Fill in required fields or use expressions
4. Run the workflow and view the results

---

## 📝 License

This project is licensed under the [MIT License](LICENSE).

---

## 🙋 Support

If you run into issues or have questions, feel free to open an issue on [GitHub](https://github.com/xqueue/n8n-nodes-maileon/issues).
