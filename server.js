const express = require('express');
const cors = require('cors');
const math = require('mathjs');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.post('/api/calculate', (req, res) => {
  try {
    const { expression, operation } = req.body;
    
    let result;
    
    switch (operation) {
      case 'solve':
        // For solving equations like "x + 2 = 5"
        try {
          // Extract the equation parts
          const equationParts = expression.split('=');
          if (equationParts.length !== 2) {
            throw new Error('Invalid equation format. Use format like "x + 2 = 5"');
          }
          
          const leftSide = equationParts[0].trim();
          const rightSide = equationParts[1].trim();
          
          // Rearrange to standard form: expression = 0
          const equation = `${leftSide} - (${rightSide})`;
          
          // Solve for x
          result = math.solve(equation, 'x');
        } catch (error) {
          throw new Error(`Could not solve equation: ${error.message}`);
        }
        break;
        
      case 'simplify':
        result = math.simplify(expression).toString();
        break;
        
      case 'expand':
        // Use the correct method for expansion
        try {
          const parsed = math.parse(expression);
          result = parsed.transform(node => {
            if (node.isParenthesisNode) {
              return math.parse(math.simplify(`${node}^1`).toString());
            }
            return node;
          }).toString();
        } catch (error) {
          throw new Error(`Could not expand expression: ${error.message}`);
        }
        break;
        
      case 'factor':
        // mathjs doesn't have direct factoring, so we'll return a message
        result = "Factoring is not directly supported in this version";
        break;
        
      case 'evaluate':
        result = math.evaluate(expression);
        break;
        
      default:
        throw new Error('Invalid operation');
    }
    
    res.json({ result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build'));
  
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
  });
}

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
