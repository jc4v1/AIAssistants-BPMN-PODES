// test-openai.js
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testAPI() {
  try {
    console.log('Testing OpenAI API connection...');
    
    // Test simple completion
    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: "Hello, can you hear me?" }],
      model: "gpt-4o-mini",
    });
    
    console.log('✅ API is working!');
    console.log('Response:', completion.choices[0].message.content);
    
    // Test assistant creation
    console.log('Testing assistant creation...');
    const assistant = await openai.beta.assistants.create({
      name: "Test Assistant",
      instructions: "You are a helpful assistant.",
      model: "gpt-4o-mini",
    });
    
    console.log('✅ Assistant created successfully!');
    console.log('Assistant ID:', assistant.id);
    
    // Clean up
    await openai.beta.assistants.del(assistant.id);
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testAPI();