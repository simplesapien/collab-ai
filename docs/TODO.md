# FUTURE CONSIDERATIONS

**Open-ended questions**

* Will agents get access to the stored insights? Or will that be solely for the director when assigning tasks
* How do we determine when to move to next iteration?  
* What triggers a deeper dive vs moving to conclusions?  
* How do we prevent circular discussions?  
* How do agent responsibilities shift in each iteration?  
* When should certain agents step back or become more prominent?  
* How do we maintain coherent progression between iterations?  
* What insights do we carry forward?  
* How do we prevent repetition while building depth?  
* How do we track the evolution of understanding?


**Hard later**

* Adding real-time communication capabilities (WebSocket/SSE)   
* Look into adding a bunch of agents that the director can choose from.   
* look into giving the Director a function to create an agent   
* Look into ways to reduce redundant storage (not having same insights over n over)  
* Look into other multi agent orchestrator repos and see how they’ve done it  
* Look into other agents taht have been made (templates on langflow)  
* Check out what other ‘agent frameworks’ or ‘multi-agent-orchestration” systems exist   
* Add cost optimization for LLM calls.
* Implement Voting System Class
   * Agent voting mechanisms
   * Add vote weighting system
   * Implement consensus detection
   * Add voting round management
* Implement Priority Queue System
   * Topic prioritization logic
   * Add dynamic priority adjustment
* Topic complexity analysis (to determine how many stages of discussion a topic needs)
* Use the confidence score of a storedInsight to determine whether that insight should be fact-checked or not
* Track the topics/problems that the user has asked about over-time, ensure they are all being addressed and solved
* Explore providing only relevant insights to a particular agent that can inform it's response (i.e. only provide the analyst with insights related to their expertise)


**Easier**

* Have the option to see chat history  
* Have the cost appear in the CLI.   
* Make their answers much shorter  
* Look into how these giant systems (GPT, Claude ,whatever, maintain context of a conversation)
* Update the performance logs to include more identifiable data  
  * Check first if the director one is working well  
* Update logs in messageFormatter  
* ADJUST THE phases so that they all use the execute with login properly and pass whatever their important data is to that second parameter, and have it parsed correctly by the basePhase method


**Problems**

* There isn’t enough context from previous discussions/the user’s request making it through all of the director’s methods (i.e. wanting to start something in vancouver)  
* Director plans are too action focused, these agents can’t really do anything yet.  
* Look briefly into why the analyst doesn’t seem to be getting selected as often. (only seems to be in the collaboration phase)  
* The first time the agent’s are being given their initial tasks, they are given the context of the other agents’ tasks as well    
* do i have getModelForAgent set up in two different places? isn’t really even necessary anymore  
* Why is the system constructor split into an init function   
  * Are any of those functions in system even being run?



**Potential agents:**

* Copywriter  
* Research assistant  
* Fact-checker


**Much later**

* 6 hats?  
* Look into feasibility of swapping over to socket for faster notifications to frontend   
* What data could be cached to reduce load on server/API   
* Look into session-based embedding storing/searching   
* Set up better logging system? See if it’s better to have a log per function/class? How to separate them to be more easily viewable/searchable.   
* Change over to a fetch call to the API to add in the AbortController functionality if a user wants to stop. Save API costs.


**Possible optimizations**  

* Track token usage (update logs to keep track of most costly calls)  
* Trim conversation history intelligently  
* Use smaller models for simpler tasks
* Store cumulatively validated insights in a vector db that's well tagged/categorized?
* Track the quality of agent responses based on their initial prompts, score them, adjust them over-time to see if other prompts perform better


**Next tasks in order of flow** 

1. Prompt adjustments  
   1. “Be specific, not general”  
   2. Get the agents to focus on having true shorter back-and-forth dialogues.   
   3. Get agents to truly build on previous points  
   4. Roles (Analyst, Critic, Expert) sometimes blur together with overlapping perspectives  
   5. Responses from agents are currently not meaningful.   
   6. Topic drift from practical next steps to theoretical discussions  
   7. “Don’t over abstract concepts. Focus on concrete, actionable guidance”  
   8. Over-emphasis on long-term strategy rather than immediate actionable items  
   9. Complex theoretical frameworks proposed before basic foundations are established  
   10. Excessive detail in responses that could be more concise  
   11. Director is summarizing rather than synthesizing key points  
   12. Make sure these agents aren’t primed to just agree with each other.   
2. Specialists being assigned and completing their tasks   
   1. Analyst may need to be adjusted to only analyze a certain subset of messages  
   2. They can identify areas that need further exploring based on their expertise?  
3. Conversation manager working at filtering out information to reduce token load on system/make sure only relevant data being stored  
4. A collaborative period begins (iteration manager class? Or just keep it all in qualitygate class)  
   1. Every iteration of this period is checked against validation metrics and/or quality gate?  
      1. Drift, consensus, questions answered, Active goals \+ conversation goals, satisfactory depth of understanding, actionable recommendations, maximum iteration limit  
      2. There needs to be a clear progression towards actionable conclusions   
      3. Redundant restatement of points across multiple exchanges   
      4. Need to track whether new complexities are being introduced vs resolving existing pains  
      5. If they are not met, continue through the collaboration period  
         1. At one point should parallel processing be considered?  
      6. Pattern/opportunity recognition of some kind  
   2. Does the director review the previous response and decide who is most useful to answer next? Or do I randomly select an agent?    
   3. Possible flow:  
      1. Iteration 1 → surface level comprehension, key question/problem identification, initial scope definition, basic direction for next steps  
      2. Iteration 2 → basic analysis from each relevant agent, identify areas needing deeper exploration, pattern/opportunity recognition  
      3. Iteration 3 → focus on most promising/critical aspects, challenge assumptions based on previous iterations, build on **validated** insights    
   4. If quality gate met, the director will synthesize responses and present the final output   
5. If there is another query, be mindful of what the context is that you maintain going forward  
   1. This could be the spot where we pull out only key points to carry forward into the next round of discussion.   
   2. Relevant history selection, priority information marking   
6. Speed \+ cost checks  
   1. Try to drop API costs. Explore alternative LLMs?  
   2. Look below at optimization strategies 