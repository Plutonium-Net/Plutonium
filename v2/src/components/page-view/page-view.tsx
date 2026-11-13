import './page-view.css'

export default function PageView({ title }: { title: string }) {
  return (
    <div className="page-view">
      <h1 className="page-view__title">{title}</h1>
    </div>
  )
}
