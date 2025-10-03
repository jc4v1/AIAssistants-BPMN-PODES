const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize OpenAI with Assistants API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store conversation threads (in production, use a database)
const conversationThreads = new Map();

// Exercise definitions
const exercises = require('./exercises/exercises.json');

// Create assistant for each exercise type
async function createAssistant(exerciseData) {
  const assistant = await openai.beta.assistants.create({
    name: `BPM Domain Expert - ${exerciseData.title}`,
    instructions: `You are a domain expert being interviewed about the "${exerciseData.title}" business process.

DOMAIN ALIGNMENT:
Process Description: ${exerciseData.description}
Reference Solution: ${exerciseData.referenceSolution}

Your role is to simulate a realistic business domain expert who knows the process intimately but responds naturally to questions. You should:

1. Provide accurate information about the process based on the reference solution
2. Not give away the entire process in one response
3. Answer questions as a real expert would - sometimes requiring follow-up questions for clarity
4. Use business terminology naturally
5. Occasionally mention practical considerations and edge cases
6. Guide the conversation subtly toward complete process understanding

PERSONA ALIGNMENT:
- Role: ${exerciseData.expertPersona.role}
- Experience: ${exerciseData.expertPersona.experience} 
- Communication Style: ${exerciseData.expertPersona.style}

Respond in a conversational, helpful manner. Add appropriate filler words and natural speech patterns. Be collaborative but not overly verbose. If asked about specific details not in your knowledge, acknowledge limitations professionally.`,
    model: "gpt-4o-mini",
    temperature: 1.0,
  });
  
  return assistant;
}

// Routes
app.get('/api/exercises', (req, res) => {
  const exerciseList = Object.keys(exercises).map(code => ({
    code,
    title: exercises[code].title,
    description: exercises[code].description.substring(0, 200) + '...'
  }));
  res.json(exerciseList);
});

app.post('/api/start-exercise', async (req, res) => {
  try {
    const { exerciseCode } = req.body;
    const exerciseData = exercises[exerciseCode];
    
    if (!exerciseData) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    // Create assistant for this exercise
    const assistant = await createAssistant(exerciseData);
    
    // Create conversation thread
    const thread = await openai.beta.threads.create();
    
    // Store conversation context
    const conversationId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    conversationThreads.set(conversationId, {
      threadId: thread.id,
      assistantId: assistant.id,
      exerciseCode,
      exerciseData
    });

    res.json({
      conversationId,
      exercise: {
        code: exerciseCode,
        title: exerciseData.title,
        description: exerciseData.description,
        learningObjectives: exerciseData.learningObjectives
      }
    });
  } catch (error) {
    console.error('Error starting exercise:', error);
    res.status(500).json({ error: 'Failed to start exercise' });
  }
});

app.post('/api/send-message', async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    const conversation = conversationThreads.get(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Add user message to thread
    await openai.beta.threads.messages.create(conversation.threadId, {
      role: "user",
      content: message
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(conversation.threadId, {
      assistant_id: conversation.assistantId
    });

    // Wait for completion
    let runStatus = await openai.beta.threads.runs.retrieve(conversation.threadId, run.id);
    
    while (runStatus.status === 'running' || runStatus.status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(conversation.threadId, run.id);
    }

    if (runStatus.status === 'completed') {
      // Get the assistant's response
      const messages = await openai.beta.threads.messages.list(conversation.threadId);
      const assistantMessage = messages.data.find(msg => msg.role === 'assistant' && msg.run_id === run.id);
      
      res.json({
        response: assistantMessage.content[0].text.value,
        status: 'success'
      });
    } else {
      res.status(500).json({ error: 'Assistant run failed', status: runStatus.status });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.get('/api/exercise-solution/:code', (req, res) => {
  const exerciseData = exercises[req.params.code];
  if (!exerciseData) {
    return res.status(404).json({ error: 'Exercise not found' });
  }
  
  res.json({
    referenceSolution: exerciseData.referenceSolution,
    bpmnDiagram: exerciseData.bpmnDiagram
  });
});

app.listen(port, () => {
  console.log(`BPM-LEIA server running on http://localhost:${port}`);
});
