import React, { useEffect, useState } from 'react';
import { CrawledItem } from '../../shared/types';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import './Dashboard.css';

interface DashboardProps {
  data: CrawledItem[];
  isCrawling: boolean;
}

interface AnalysisResult {
  sentiment: {
    average: number;
    distribution: {
      positive: number;
      negative: number;
      neutral: number;
    };
  };
  wordCloud: Array<{ text: string; value: number }>;
}

const COLORS = ['#10b981', '#f43f5e', '#64748b'];
const PLATFORM_COLORS: Record<string, string> = {
  '小红书': '#ff2442',
  '抖音': '#1c0b1b',
  '微博': '#ff8200',
  'B站': '#fb7299',
};

export const Dashboard: React.FC<DashboardProps> = ({ data, isCrawling }) => {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerateAiInsight = async () => {
    if (data.length === 0) return;
    setIsAiLoading(true);
    setAiError(null);
    try {
      const texts = data.map(item => item.content).filter(Boolean);
      const res = await window.electronAPI.aiAnalyzeData('请总结这份社交媒体数据的核心观点、用户主要痛点、情感趋势，并给出简短的商业建议。', texts);
      if (res.error) {
        setAiError(res.error);
      } else {
        setAiInsight(res.result || 'AI 未返回有效内容');
      }
    } catch (err) {
      setAiError(String(err));
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (data.length === 0 || isCrawling) {
      setAnalysis(null);
      return;
    }

    const analyze = async () => {
      setIsAnalyzing(true);
      try {
        const texts = data.map(item => item.content).filter(Boolean);
        const result = await window.electronAPI.analyzeData(texts);
        if (result && !result.error) {
          setAnalysis(result);
        } else {
          console.error('Analysis error:', result?.error);
        }
      } catch (err) {
        console.error('Failed to invoke analyze API', err);
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyze();
  }, [data, isCrawling]);

  if (data.length === 0) {
    return (
      <div className="dashboard-empty">
        <p>暂无数据可分析，请先采集数据</p>
      </div>
    );
  }

  // 平台分布
  const platformCounts = data.reduce((acc, item) => {
    acc[item.platform] = (acc[item.platform] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const platformData = Object.entries(platformCounts).map(([name, value]) => ({ name, value }));

  // 互动排行 (使用评论数作为互动量指标)
  const topEngaged = [...data]
    .sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0))
    .slice(0, 5)
    .map(item => ({
      author: item.author || '未知',
      platform: item.platform,
      comments: item.comments?.length || 0
    }));

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>数据洞察看板</h2>
        <span className="data-count">总数据量: {data.length} 条</span>
      </div>

      <div className="dashboard-grid">
        {/* 平台分布图 */}
        <div className="dashboard-card">
          <h3>平台数据分布</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {platformData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PLATFORM_COLORS[entry.name] || '#8884d8'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 互动排行 */}
        <div className="dashboard-card">
          <h3>高互动内容 Top 5</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topEngaged} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="author" type="category" width={80} tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.1)' }} />
                <Bar dataKey="comments" name="评论数" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 情感分析 */}
        <div className="dashboard-card">
          <h3>情感倾向分析</h3>
          {isAnalyzing ? (
            <div className="chart-loading">AI 分析中...</div>
          ) : analysis ? (
            <div className="sentiment-container">
              <div className="sentiment-score">
                <span className="score-value">{(analysis.sentiment.average * 100).toFixed(1)}</span>
                <span className="score-label">综合积极指数</span>
              </div>
              <div className="chart-wrapper" style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: '积极', value: analysis.sentiment.distribution.positive },
                        { name: '消极', value: analysis.sentiment.distribution.negative },
                        { name: '中性', value: analysis.sentiment.distribution.neutral },
                      ]}
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                      dataKey="value"
                      label
                    >
                      {COLORS.map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="chart-loading">分析失败或无文本</div>
          )}
        </div>

        {/* 词云图 */}
        <div className="dashboard-card">
          <h3>高频词云</h3>
          {isAnalyzing ? (
            <div className="chart-loading">提取关键字中...</div>
          ) : analysis && analysis.wordCloud.length > 0 ? (
            <div className="wordcloud-wrapper">
              {analysis.wordCloud.map((word, index) => (
                <span
                  key={index}
                  className="wordcloud-item"
                  style={{
                    fontSize: `${Math.max(12, Math.min(32, word.value * 100))}px`,
                    opacity: Math.max(0.4, Math.min(1, word.value * 20)),
                    color: `hsl(${Math.random() * 360}, 70%, 60%)`
                  }}
                >
                  {word.text}
                </span>
              ))}
            </div>
          ) : (
            <div className="chart-loading">无足够文本生成词云</div>
          )}
        </div>
      </div>

      {/* AI 深度分析 */}
      <div className="dashboard-ai-card">
        <div className="ai-card-header">
          <h3>🤖 AI 深度分析洞察</h3>
          <button 
            className="generate-ai-btn" 
            onClick={handleGenerateAiInsight} 
            disabled={isAiLoading || data.length === 0}
          >
            {isAiLoading ? 'AI 思考中...' : '生成洞察报告'}
          </button>
        </div>
        <div className="ai-card-content">
          {aiError ? (
            <div className="ai-error">{aiError}</div>
          ) : aiInsight ? (
            <div className="ai-result">
              {aiInsight.split('\n').map((line, i) => <p key={i}>{line}</p>)}
            </div>
          ) : (
            <div className="ai-placeholder">
              点击上方按钮，AI 将根据当前的采集数据，提取典型用户画像、核心痛点并给出商业建议。需在“设置”中配置 OpenAI 兼容的 API 信息。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};