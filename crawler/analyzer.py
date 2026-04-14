import sys
import json
import jieba
import jieba.analyse
from snownlp import SnowNLP

def analyze():
    input_data = sys.stdin.read().strip()
    if not input_data:
        return
        
    try:
        data = json.loads(input_data)
        texts = data.get("texts", [])
        
        # 1. Sentiment Analysis
        sentiments = []
        positive_count = 0
        negative_count = 0
        neutral_count = 0
        
        for text in texts:
            if not text.strip():
                continue
            try:
                s = SnowNLP(text)
                score = s.sentiments # 0 to 1
                sentiments.append(score)
                if score > 0.6:
                    positive_count += 1
                elif score < 0.4:
                    negative_count += 1
                else:
                    neutral_count += 1
            except Exception:
                pass
                
        # 2. Keyword Extraction (Word Cloud)
        combined_text = " ".join(texts)
        # Extract top 50 keywords with TF-IDF
        keywords = jieba.analyse.extract_tags(combined_text, topK=50, withWeight=True)
        
        word_cloud = [{"text": k[0], "value": k[1]} for k in keywords]
        
        result = {
            "sentiment": {
                "average": sum(sentiments) / len(sentiments) if sentiments else 0.5,
                "distribution": {
                    "positive": positive_count,
                    "negative": negative_count,
                    "neutral": neutral_count
                }
            },
            "wordCloud": word_cloud
        }
        
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    analyze()
