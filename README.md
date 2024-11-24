
```
collab-ai
├─ (server).js
├─ .DS_Store
├─ README.md
├─ flowchart.md
├─ package-lock.json
├─ package.json
└─ src
   ├─ .DS_Store
   ├─ agents
   │  ├─ agent
   │  │  ├─ analyst
   │  │  │  └─ analyst.js
   │  │  ├─ critic
   │  │  │  └─ critic.js
   │  │  ├─ director
   │  │  │  └─ director.js
   │  │  └─ expert
   │  │     └─ expert.js
   │  ├─ agentFactory.js
   │  ├─ base
   │  │  └─ baseAgent.js
   │  └─ interfaces
   │     └─ agent.js
   ├─ app.js
   ├─ cli.js
   ├─ config
   │  ├─ agentConfigs.js
   │  └─ config.js
   ├─ services
   │  └─ LLMService.js
   ├─ system
   │  ├─ coordination
   │  │  ├─ coordinator.js
   │  │  └─ phases
   │  │     ├─ base.js
   │  │     ├─ collaboration.js
   │  │     ├─ planning.js
   │  │     ├─ response.js
   │  │     └─ summary.js
   │  ├─ notification
   │  │  ├─ NotificationService.js
   │  │  └─ NotifyManager.js
   │  ├─ quality
   │  │  └─ QualityGate.js
   │  ├─ support
   │  │  ├─ AgentManager.js
   │  │  ├─ ConversationManager.js
   │  │  └─ InsightManager.js
   │  └─ system.js
   └─ utils
      ├─ costTracker.js
      ├─ generators.js
      ├─ logger.js
      ├─ messageFormatter.js
      ├─ rateLimiter.js
      └─ validators.js

```