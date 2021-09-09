package views.html.ublog

import controllers.routes
import play.api.mvc.Call

import lila.api.Context
import lila.app.templating.Environment._
import lila.app.ui.ScalatagsTemplate._
import lila.common.paginator.Paginator
import lila.ublog.{ UblogPost, UblogTopic }
import lila.user.User

object index {

  import views.html.ublog.{ post => postView }

  def drafts(user: User, posts: Paginator[UblogPost.PreviewPost])(implicit ctx: Context) =
    views.html.base.layout(
      moreCss = frag(cssTag("ublog")),
      moreJs = posts.hasNextPage option infiniteScrollTag,
      title = s"${trans.ublog.drafts()}"
    ) {
      main(cls := "page-menu")(
        views.html.blog.bits.menu(none, "mine".some),
        div(cls := "page-menu__content box box-pad ublog-index")(
          div(cls := "box__top")(
            h1(trans.ublog.drafts()),
            div(cls := "box__top__actions")(
              a(href := routes.Ublog.index(user.username))(trans.ublog.published()),
              postView.newPostLink
            )
          ),
          if (posts.nbResults > 0)
            div(cls := "ublog-index__posts ublog-index__posts--drafts ublog-post-cards infinite-scroll")(
              posts.currentPageResults map { postView.card(_, postView.editUrlOfPost) },
              pagerNext(posts, np => routes.Ublog.drafts(user.username, np).url)
            )
          else
            div(cls := "ublog-index__posts--empty")(
              trans.ublog.noDrafts()
            )
        )
      )
    }

  def friends(posts: Paginator[UblogPost.PreviewPost])(implicit ctx: Context) = list(
    title = "Friends blogs",
    posts = posts,
    menuItem = "friends",
    route = routes.Ublog.friends _,
    onEmpty = "Nothing to show. Follow some authors!"
  )

  def liked(posts: Paginator[UblogPost.PreviewPost])(implicit ctx: Context) = list(
    title = "Liked blog posts",
    posts = posts,
    menuItem = "liked",
    route = routes.Ublog.liked _,
    onEmpty = "Nothing to show. Like some posts!"
  )

  def topic(top: UblogTopic, posts: Paginator[UblogPost.PreviewPost])(implicit ctx: Context) = list(
    title = s"Blog posts about $top",
    posts = posts,
    menuItem = "topics",
    route = p => routes.Ublog.topic(top.value, p),
    onEmpty = "Nothing to show."
  )

  def community(posts: Paginator[UblogPost.PreviewPost])(implicit ctx: Context) = list(
    title = "Community blogs",
    posts = posts,
    menuItem = "community",
    route = routes.Ublog.community _,
    onEmpty = "Nothing to show."
  )

  def topics(tops: List[UblogTopic.WithPosts])(implicit ctx: Context) =
    views.html.base.layout(
      moreCss = cssTag("ublog"),
      title = "All blog topics"
    ) {
      main(cls := "page-menu")(
        views.html.blog.bits.menu(none, "topics".some),
        div(cls := "page-menu__content box box-pad ublog-index")(
          div(cls := "box__top")(h1("All blog topics")),
          div(cls := "ublog-topics")(
            tops.map { case UblogTopic.WithPosts(topic, posts, nb) =>
              st.section(cls := "ublog-topics__topic")(
                h2(
                  a(href := routes.Ublog.topic(topic.url))(
                    strong(topic.value),
                    span(cls := "ublog-topics__topic__nb")(trans.ublog.viewAllNbPosts(nb), " »")
                  )
                ),
                div(cls := "ublog-topics__topic__posts ublog-post-cards")(
                  posts map { postView.miniCard(_, showAuthor = true) }
                )
              )
            }
          )
        )
      )
    }

  private def list(
      title: String,
      posts: Paginator[UblogPost.PreviewPost],
      menuItem: String,
      route: Int => Call,
      onEmpty: => Frag
  )(implicit ctx: Context) =
    views.html.base.layout(
      moreCss = cssTag("ublog"),
      moreJs = posts.hasNextPage option infiniteScrollTag,
      title = title
    ) {
      main(cls := "page-menu")(
        views.html.blog.bits.menu(none, menuItem.some),
        div(cls := "page-menu__content box box-pad ublog-index")(
          div(cls := "box__top")(h1(title)),
          if (posts.nbResults > 0)
            div(cls := "ublog-index__posts ublog-post-cards infinite-scroll")(
              posts.currentPageResults map { postView.card(_, showAuthor = true) },
              pagerNext(posts, np => route(np).url)
            )
          else
            div(cls := "ublog-index__posts--empty")(onEmpty)
        )
      )
    }
}
