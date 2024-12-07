# December 7th, 2024

## Misc thoughts + problems:

- Fix the chat at the bottom to be better for mobile. Keep it just simple JS + CSS for now. 
- Move the method to derive insights  to the insight manager so that each phase can handle its own insight filtering + storing upon getting a high quality response from the LLM
- Enhance the insight storage insight the director’s method 
- Find a better way of determining (with the LLM) what might constitute an insight over something else 
- Implement the similarity check insight that same method that checks the proposed additions to the insights array and only adds them if they are below  a certain score (let’s say .6)
- Make sure those insights are being passed to the director on the subsequent iterations of the chat 
- Implement relevance score in qualitycheck using embeddings + examples in the utils file 
- Take out hte LLM service from eahc individual agent. It should be getting passed through to the base-agent 
- If the program hits the max retry, it seems to fritz out (at least the notifications do). See if there is some fallback you can use? Or something you can change to send to the CLI. 
- There is a qualityGate instantiated inside of the InsightManager, but also another one attached to the coordinator? Is that an issue? The qualityGate doesn’t really need to be stateful does it? It’s just going to be a collection of methods that can quality check stuff. 
- Provide the entire class instantiation mess to Claude and have it point out doubly instantiated classes. 

